"""
Modelo de riesgo de morosidad (componente de IA del proyecto).

PREGUNTA QUE RESPONDE
    Para cada titular, ¿qué probabilidad hay de que NO pague la cuota de
    mantenimiento del mes en curso dentro del periodo de gracia (30 días
    después del vencimiento)? Así la administración puede actuar ANTES de
    que el socio caiga en morosidad (recordatorio, llamada, facilidades).

CÓMO SE EVITA HACER TRAMPA (fuga de datos)
    Cada ejemplo se construye en una "fecha de corte" (el día 1 de un mes).
    Las variables usan SOLO pagos registrados antes del corte; la etiqueta
    mira lo que pasó DESPUÉS. La evaluación es temporal: se entrena con
    meses antiguos y se mide con meses recientes, como ocurriría en producción.

Este módulo no depende de Streamlit: se prueba con pytest (tests/test_riesgo.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

DIAS_GRACIA = 30
# Umbrales sobre probabilidades CALIBRADAS. Con una morosidad base de ~7 %,
# 20 % es unas 3 veces el promedio y 10 % unas 1.5 veces. Se eligieron midiendo
# precisión y cobertura en los meses de prueba (ver docs/sprints/sprint-05.md).
UMBRAL_ALTO = 0.20
UMBRAL_MEDIO = 0.10

# Variables del modelo: nombre técnico -> descripción en español para el panel.
# Se descartaron (ver docs/sprints/sprint-05.md): la deuda en soles (es exactamente
# 180 x cuotas impagas), el retraso máximo (redundante con el promedio) y las
# reservas recientes (sin historial suficiente en los meses de entrenamiento).
VARIABLES: dict[str, str] = {
    "cuotas_impagas": "Cuotas vencidas sin pagar",
    "pct_pagadas_tarde": "% de cuotas pagadas después del vencimiento",
    "retraso_promedio": "Días de retraso promedio",
    "pct_tarde_reciente": "% pagadas tarde en los últimos 3 meses",
    "dias_sin_pagar": "Días desde el último pago",
    "cuotas_historicas": "Cuotas emitidas hasta la fecha",
    "antiguedad_anios": "Antigüedad como socio (años)",
    "dependientes": "Número de dependientes",
}
# Variables descriptivas que se calculan para el panel pero NO entran al modelo
DESCRIPTIVAS = ["deuda_actual", "retraso_maximo", "reservas_90d"]


# ============================================================ preparación
def fecha_de_cancelacion(cuotas: pd.DataFrame, pagos: pd.DataFrame) -> pd.Series:
    """
    Fecha en que cada cuota quedó pagada por completo (suma de pagos >= monto).
    Soporta pagos parciales. NaT si nunca se completó.

    cuotas: columnas cuota_id, monto
    pagos:  columnas cuota_id, monto, pagado_en (solo pagos APROBADOS)
    """
    if pagos.empty:
        return pd.Series(pd.NaT, index=cuotas.index, dtype="datetime64[ns]")

    p = pagos.sort_values("pagado_en").copy()
    p["acumulado"] = p.groupby("cuota_id")["monto"].cumsum()
    p = p.merge(cuotas[["cuota_id", "monto"]].rename(columns={"monto": "monto_cuota"}), on="cuota_id")
    completas = p[p["acumulado"] >= p["monto_cuota"] - 0.005]
    primera = completas.groupby("cuota_id")["pagado_en"].min()
    return cuotas["cuota_id"].map(primera).astype("datetime64[ns]")


def preparar_cuotas(cuotas: pd.DataFrame, pagos: pd.DataFrame) -> pd.DataFrame:
    """Normaliza tipos y agrega la fecha de cancelación de cada cuota."""
    c = cuotas.copy()
    c["fecha_vencimiento"] = pd.to_datetime(c["fecha_vencimiento"])
    c["periodo"] = pd.to_datetime(c["periodo"])
    p = pagos.copy()
    if not p.empty:
        # Fechas de pago en hora de Lima, sin zona (para comparar con fechas simples)
        p["pagado_en"] = pd.to_datetime(p["pagado_en"], utc=True).dt.tz_convert("America/Lima").dt.tz_localize(None)
    c["cancelada_en"] = fecha_de_cancelacion(c, p)
    return c


# ============================================================ variables y etiqueta
def construir_variables(
    cuotas: pd.DataFrame,
    socios: pd.DataFrame,
    reservas: pd.DataFrame,
    corte: pd.Timestamp,
) -> pd.DataFrame:
    """
    Variables de cada titular usando SOLO información anterior a `corte`.

    cuotas:   preparadas (socio_id, periodo, fecha_vencimiento, cancelada_en)
    socios:   socio_id, fecha_afiliacion, dependientes
    reservas: titular_id, inicio (fecha de la reserva)
    """
    corte = pd.Timestamp(corte)
    hist = cuotas[cuotas["fecha_vencimiento"] < corte].copy()

    # Lo que se sabía al corte: un pago posterior al corte "todavía no existía"
    conocida = hist["cancelada_en"].where(hist["cancelada_en"] < corte)
    hist["pagada_al_corte"] = conocida.notna()
    hist["tardia"] = hist["pagada_al_corte"] & (conocida > hist["fecha_vencimiento"] + pd.Timedelta(days=1))
    fin_retraso = conocida.fillna(corte)
    hist["retraso"] = (fin_retraso - hist["fecha_vencimiento"]).dt.days.clip(lower=0)
    hist["impaga"] = ~hist["pagada_al_corte"]
    hist["reciente"] = hist["fecha_vencimiento"] >= corte - pd.DateOffset(months=3)

    g = hist.groupby("socio_id")
    v = pd.DataFrame({
        "cuotas_historicas": g.size(),
        "pct_pagadas_tarde": g["tardia"].mean(),
        "retraso_promedio": g["retraso"].mean(),
        "retraso_maximo": g["retraso"].max(),
        "cuotas_impagas": g["impaga"].sum(),
        "deuda_actual": hist[hist["impaga"]].groupby("socio_id")["monto"].sum(),
        "ultimo_pago": hist.groupby("socio_id")["cancelada_en"].apply(lambda s: s[s < corte].max()),
        "pct_tarde_reciente": hist[hist["reciente"]].groupby("socio_id")["tardia"].mean(),
    })

    base = socios.set_index("socio_id")[["fecha_afiliacion", "dependientes"]].copy()
    v = base.join(v, how="inner")
    v["dias_sin_pagar"] = (corte - v["ultimo_pago"]).dt.days
    # Si nunca pagó, se usa la antigüedad de su primera cuota como cota superior
    v["dias_sin_pagar"] = v["dias_sin_pagar"].fillna(v["retraso_maximo"]).fillna(0)
    v["antiguedad_anios"] = (corte - pd.to_datetime(v["fecha_afiliacion"])).dt.days / 365.25
    v["pct_tarde_reciente"] = v["pct_tarde_reciente"].fillna(v["pct_pagadas_tarde"])
    v["deuda_actual"] = v["deuda_actual"].fillna(0.0)

    if not reservas.empty:
        r = reservas[(reservas["inicio"] < corte) & (reservas["inicio"] >= corte - pd.Timedelta(days=90))]
        v["reservas_90d"] = r.groupby("titular_id").size().reindex(v.index).fillna(0)
    else:
        v["reservas_90d"] = 0.0

    v = v[list(VARIABLES) + DESCRIPTIVAS].astype(float)
    v.index.name = "socio_id"
    return v


def construir_etiqueta(cuotas: pd.DataFrame, corte: pd.Timestamp) -> pd.Series:
    """
    1 si la cuota del mes del corte NO se pagó dentro de los 30 días de gracia
    posteriores a su vencimiento; 0 si se pagó a tiempo o dentro de la gracia.
    """
    corte = pd.Timestamp(corte)
    del_mes = cuotas[cuotas["periodo"] == corte]
    limite = del_mes["fecha_vencimiento"] + pd.Timedelta(days=DIAS_GRACIA + 1)
    morosa = del_mes["cancelada_en"].isna() | (del_mes["cancelada_en"] >= limite)
    return pd.Series(morosa.astype(int).values, index=del_mes["socio_id"].values, name="moroso")


# ============================================================ entrenamiento
@dataclass
class ResultadoModelo:
    modelo: Pipeline
    metricas: dict[str, float]              # en el conjunto de prueba (meses más recientes)
    metricas_regla_simple: dict[str, float]  # línea base: "si ya debe una cuota, será moroso"
    matriz_confusion: np.ndarray
    importancia: pd.DataFrame
    filas_entrenamiento: int
    filas_prueba: int
    cortes_entrenamiento: list[date] = field(default_factory=list)
    cortes_prueba: list[date] = field(default_factory=list)
    tasa_morosidad: float = 0.0


def cortes_observables(hoy: date, meses_atras: int = 9) -> list[pd.Timestamp]:
    """
    Meses cuyo resultado ya se conoce: la cuota vence a fin de mes y hay que
    esperar los 30 días de gracia, así que el último mes evaluable es hace 2 meses.
    """
    mes_actual = pd.Timestamp(hoy).to_period("M").to_timestamp()
    cortes = [mes_actual - pd.DateOffset(months=k) for k in range(meses_atras, 1, -1)]
    return [c for c in cortes
            if c + pd.DateOffset(months=1) - pd.Timedelta(days=1) + pd.Timedelta(days=DIAS_GRACIA) < pd.Timestamp(hoy)]


def armar_dataset(cuotas, socios, reservas, cortes) -> pd.DataFrame:
    partes = []
    for corte in cortes:
        x = construir_variables(cuotas, socios, reservas, corte)
        y = construir_etiqueta(cuotas, corte)
        d = x.join(y, how="inner")
        d["corte"] = corte
        partes.append(d)
    return pd.concat(partes) if partes else pd.DataFrame()


def _metricas(y_real, prob, umbral=UMBRAL_ALTO) -> dict[str, float]:
    y_real = np.asarray(y_real)
    prob = np.asarray(prob, dtype=float)
    pred = (prob >= umbral).astype(int)
    # Precisión en el 10 % de mayor riesgo: "de cada 10 socios que el modelo
    # pone primero en la lista, ¿cuántos realmente cayeron en mora?"
    k = max(1, int(round(len(prob) * 0.10)))
    top = np.argsort(-prob, kind="stable")[:k]
    return {
        "auc": float(roc_auc_score(y_real, prob)) if len(set(y_real)) > 1 else float("nan"),
        "precision": float(precision_score(y_real, pred, zero_division=0)),
        "recall": float(recall_score(y_real, pred, zero_division=0)),
        "f1": float(f1_score(y_real, pred, zero_division=0)),
        "precision_top10": float(y_real[top].mean()),
        "brier": float(brier_score_loss(y_real, np.clip(prob, 0, 1))),
        "prob_media": float(prob.mean()),
        "tasa_real": float(y_real.mean()),
    }


def entrenar(cuotas, socios, reservas, hoy: date, meses_prueba: int = 2) -> ResultadoModelo:
    """Entrena una regresión logística con validación temporal."""
    cortes = cortes_observables(hoy)
    if len(cortes) <= meses_prueba:
        raise ValueError("No hay suficiente historial para entrenar (se necesitan al menos 4 meses)")
    entrenamiento, prueba = cortes[:-meses_prueba], cortes[-meses_prueba:]

    d_ent = armar_dataset(cuotas, socios, reservas, entrenamiento)
    d_pru = armar_dataset(cuotas, socios, reservas, prueba)
    cols = list(VARIABLES)

    modelo = Pipeline([
        ("escalado", StandardScaler()),
        # Sin class_weight='balanced': rebalancear mantiene el AUC pero infla las
        # probabilidades (media 0.31 frente a una morosidad real de 0.07). Sin él,
        # la probabilidad es interpretable tal cual ("35 % de riesgo").
        ("regresion", LogisticRegression(max_iter=2000, random_state=42)),
    ])
    modelo.fit(d_ent[cols], d_ent["moroso"])

    prob = modelo.predict_proba(d_pru[cols])[:, 1]
    y = d_pru["moroso"].to_numpy()

    # Línea base para comparar: "si ya tiene una cuota impaga, será moroso"
    regla = (d_pru["cuotas_impagas"] > 0).astype(float).to_numpy()

    # Importancia por permutación: cuánto cae el AUC al desordenar cada variable
    # en los datos de prueba. A diferencia de los pesos de la regresión, no se
    # distorsiona cuando dos variables están correlacionadas.
    perm = permutation_importance(modelo, d_pru[cols], y, scoring="roc_auc", n_repeats=15, random_state=42)
    coef = modelo.named_steps["regresion"].coef_[0]
    importancia = (
        pd.DataFrame({
            "variable": cols,
            "descripcion": [VARIABLES[c] for c in cols],
            "importancia": np.clip(perm.importances_mean, 0, None),
            "peso": coef,
        })
        .sort_values("importancia", ascending=False)
        .reset_index(drop=True)
    )

    return ResultadoModelo(
        modelo=modelo,
        metricas=_metricas(y, prob),
        metricas_regla_simple=_metricas(y, regla),
        matriz_confusion=confusion_matrix(y, (prob >= UMBRAL_ALTO).astype(int), labels=[0, 1]),
        importancia=importancia,
        filas_entrenamiento=len(d_ent),
        filas_prueba=len(d_pru),
        cortes_entrenamiento=[c.date() for c in entrenamiento],
        cortes_prueba=[c.date() for c in prueba],
        tasa_morosidad=float(pd.concat([d_ent["moroso"], d_pru["moroso"]]).mean()),
    )


def nivel(prob: float) -> str:
    if prob >= UMBRAL_ALTO:
        return "Alto"
    if prob >= UMBRAL_MEDIO:
        return "Medio"
    return "Bajo"


def predecir_actual(resultado: ResultadoModelo, cuotas, socios, reservas, hoy: date) -> pd.DataFrame:
    """Riesgo de cada titular de no pagar la cuota del mes en curso."""
    corte = pd.Timestamp(hoy).to_period("M").to_timestamp()
    x = construir_variables(cuotas, socios, reservas, corte)
    prob = resultado.modelo.predict_proba(x[list(VARIABLES)])[:, 1]
    salida = x.copy()
    salida["probabilidad"] = prob
    salida["nivel"] = [nivel(p) for p in prob]
    return salida.sort_values("probabilidad", ascending=False)
