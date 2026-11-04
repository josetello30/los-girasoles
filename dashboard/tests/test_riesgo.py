"""
Pruebas del modelo de riesgo de morosidad con datos sintéticos controlados.
Ejecutar:  pytest -q   (desde la carpeta dashboard)
"""
from datetime import date

import numpy as np
import pandas as pd
import pytest

from modelo import riesgo


def _cuota(cid, socio, periodo, monto=180.0):
    p = pd.Timestamp(periodo)
    venc = p + pd.offsets.MonthEnd(0)
    return {"cuota_id": cid, "socio_id": socio, "periodo": p, "fecha_vencimiento": venc, "monto": monto}


def _pago(cid, fecha, monto=180.0):
    return {"cuota_id": cid, "monto": monto, "pagado_en": pd.Timestamp(fecha, tz="America/Lima")}


# ------------------------------------------------------------ fecha de cancelación
def test_pago_parcial_cancela_cuando_completa_el_monto():
    cuotas = pd.DataFrame([_cuota("c1", "s1", "2026-01-01")])
    pagos = pd.DataFrame([_pago("c1", "2026-01-10", 90), _pago("c1", "2026-02-15", 90)])
    c = riesgo.preparar_cuotas(cuotas, pagos)
    assert c.loc[0, "cancelada_en"].date() == date(2026, 2, 15)


def test_cuota_sin_pagos_queda_sin_cancelar():
    cuotas = pd.DataFrame([_cuota("c1", "s1", "2026-01-01")])
    c = riesgo.preparar_cuotas(cuotas, pd.DataFrame(columns=["cuota_id", "monto", "pagado_en"]))
    assert pd.isna(c.loc[0, "cancelada_en"])


# ------------------------------------------------------------ fuga de datos
def test_un_pago_posterior_al_corte_no_se_conoce_en_el_corte():
    """Si la cuota de enero se pagó el 10 de marzo, al 1 de marzo debe figurar como IMPAGA."""
    cuotas = pd.DataFrame([_cuota("c1", "s1", "2026-01-01")])
    pagos = pd.DataFrame([_pago("c1", "2026-03-10")])
    socios = pd.DataFrame([{"socio_id": "s1", "fecha_afiliacion": "2020-01-01", "dependientes": 0}])
    c = riesgo.preparar_cuotas(cuotas, pagos)

    v = riesgo.construir_variables(c, socios, pd.DataFrame(), pd.Timestamp("2026-03-01"))
    assert v.loc["s1", "cuotas_impagas"] == 1
    assert v.loc["s1", "deuda_actual"] == 180
    assert v.loc["s1", "retraso_promedio"] == (pd.Timestamp("2026-03-01") - pd.Timestamp("2026-01-31")).days


def test_las_cuotas_que_aun_no_vencen_no_entran_al_historial():
    cuotas = pd.DataFrame([_cuota("c1", "s1", "2026-01-01"), _cuota("c2", "s1", "2026-02-01")])
    pagos = pd.DataFrame([_pago("c1", "2026-01-05")])
    socios = pd.DataFrame([{"socio_id": "s1", "fecha_afiliacion": "2020-01-01", "dependientes": 1}])
    c = riesgo.preparar_cuotas(cuotas, pagos)
    v = riesgo.construir_variables(c, socios, pd.DataFrame(), pd.Timestamp("2026-02-01"))
    assert v.loc["s1", "cuotas_historicas"] == 1  # la de febrero vence el 28/02
    assert v.loc["s1", "pct_pagadas_tarde"] == 0


# ------------------------------------------------------------ etiqueta
@pytest.mark.parametrize("fecha_pago, esperado", [
    ("2026-03-20", 0),   # antes del vencimiento
    ("2026-04-25", 0),   # tarde, pero dentro de los 30 días de gracia
    ("2026-05-05", 1),   # pasada la gracia
    (None, 1),           # nunca pagó
])
def test_etiqueta_considera_los_30_dias_de_gracia(fecha_pago, esperado):
    cuotas = pd.DataFrame([_cuota("c1", "s1", "2026-03-01")])
    pagos = pd.DataFrame([_pago("c1", fecha_pago)]) if fecha_pago else pd.DataFrame(columns=["cuota_id", "monto", "pagado_en"])
    c = riesgo.preparar_cuotas(cuotas, pagos)
    assert riesgo.construir_etiqueta(c, pd.Timestamp("2026-03-01")).loc["s1"] == esperado


def test_solo_se_entrena_con_meses_cuyo_resultado_ya_se_conoce():
    cortes = riesgo.cortes_observables(date(2026, 11, 4))
    # La cuota de octubre vence el 31/10 y su gracia termina el 30/11: aún no se conoce
    assert cortes[-1] == pd.Timestamp("2026-09-01")
    assert pd.Timestamp("2026-10-01") not in cortes


# ------------------------------------------------------------ modelo completo
def _historial_sintetico(n_socios=120, semilla=7):
    """Socios puntuales y morosos con comportamiento distinguible."""
    rng = np.random.default_rng(semilla)
    cuotas, pagos, socios = [], [], []
    for i in range(n_socios):
        sid = f"s{i}"
        moroso = i % 4 == 0
        socios.append({"socio_id": sid, "fecha_afiliacion": "2018-01-01", "dependientes": int(rng.integers(0, 3))})
        for m, periodo in enumerate(pd.date_range("2025-11-01", "2026-11-01", freq="MS")):
            cid = f"{sid}-{m}"
            cuotas.append(_cuota(cid, sid, periodo))
            venc = periodo + pd.offsets.MonthEnd(0)
            if moroso and rng.random() < 0.7:
                retraso = int(rng.integers(35, 90))       # paga muy tarde o...
                if rng.random() < 0.4:
                    continue                              # ...no paga
                pagos.append(_pago(cid, venc + pd.Timedelta(days=retraso)))
            else:
                pagos.append(_pago(cid, periodo + pd.Timedelta(days=int(rng.integers(0, 20)))))
    pagos = [p for p in pagos if p["pagado_en"] <= pd.Timestamp("2026-11-04", tz="America/Lima")]
    return pd.DataFrame(cuotas), pd.DataFrame(pagos), pd.DataFrame(socios)


def test_el_modelo_supera_al_azar_y_prioriza_a_los_morosos():
    cuotas, pagos, socios = _historial_sintetico()
    c = riesgo.preparar_cuotas(cuotas, pagos)
    res = riesgo.entrenar(c, socios, pd.DataFrame(), hoy=date(2026, 11, 4))

    assert res.metricas["auc"] > 0.8
    assert res.filas_prueba > 0 and res.filas_entrenamiento > res.filas_prueba
    assert res.cortes_prueba[-1] == date(2026, 9, 1)

    pred = riesgo.predecir_actual(res, c, socios, pd.DataFrame(), hoy=date(2026, 11, 4))
    top = pred.head(20).index
    morosos_en_top = sum(int(s[1:]) % 4 == 0 for s in top)
    assert morosos_en_top >= 15  # la mayoría del top 20 son los morosos reales
    assert set(pred["nivel"]) <= {"Alto", "Medio", "Bajo"}


def test_las_probabilidades_estan_calibradas():
    """La probabilidad media predicha debe parecerse a la tasa real de morosidad."""
    cuotas, pagos, socios = _historial_sintetico(n_socios=200, semilla=11)
    c = riesgo.preparar_cuotas(cuotas, pagos)
    res = riesgo.entrenar(c, socios, pd.DataFrame(), hoy=date(2026, 11, 4))
    assert abs(res.metricas["prob_media"] - res.metricas["tasa_real"]) < 0.08
    assert res.metricas["precision_top10"] >= res.metricas["tasa_real"]  # mejor que elegir al azar


def test_la_importancia_identifica_las_variables_de_pago():
    cuotas, pagos, socios = _historial_sintetico()
    c = riesgo.preparar_cuotas(cuotas, pagos)
    res = riesgo.entrenar(c, socios, pd.DataFrame(), hoy=date(2026, 11, 4))
    principales = set(res.importancia.head(3)["variable"])
    assert principales & {"cuotas_impagas", "pct_pagadas_tarde", "retraso_promedio", "pct_tarde_reciente"}
    assert (res.importancia["importancia"] >= 0).all()
