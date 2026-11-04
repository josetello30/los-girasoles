"""
Morosidad y riesgo (componente de IA): cuentas vencidas hoy y predicción de
qué titulares probablemente NO pagarán la cuota del mes, para actuar antes.
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from modelo import riesgo
from servicios import cache

c.encabezado("Morosidad e IA", "Cuentas vencidas y riesgo predicho con un modelo de regresión logística (scikit-learn)")

resultado, prediccion = cache.modelo_riesgo(c.ahora().date())
cuentas = cache.estado_cuenta()
prediccion = prediccion.join(cuentas.set_index("socio_id")[["estado_pago", "deuda_total"]])

vencidos = cuentas[cuentas["estado_pago"] == "VENCIDO"]
alto = prediccion[prediccion["nivel"] == "Alto"]
preventivos = alto[alto["estado_pago"] != "VENCIDO"]

k = st.columns(4)
k[0].metric("Titulares morosos", f"{len(vencidos)}", border=True,
            help="Con alguna cuota vencida hace más de 30 días")
k[1].metric("Deuda vencida", c.soles(vencidos["deuda_vencida"].sum()), border=True)
k[2].metric("Riesgo alto (IA)", f"{len(alto)}", border=True,
            delta=f"{len(preventivos)} aún no son morosos", delta_color="off", delta_arrow="off",
            help=f"Probabilidad ≥ {riesgo.UMBRAL_ALTO:.0%} de no pagar la cuota de este mes a tiempo")
k[3].metric("AUC del modelo", f"{resultado.metricas['auc']:.2f}", border=True,
            delta=f"Regla simple: {resultado.metricas_regla_simple['auc']:.2f}", delta_color="off", delta_arrow="off",
            help="Capacidad de ordenar a los socios de más a menos riesgo (0.5 = azar, 1 = perfecto)")

pestana_riesgo, pestana_vencidas, pestana_modelo = st.tabs(
    ["Riesgo predicho", "Cuentas vencidas", "¿Cómo funciona el modelo?"])

# ---------------------------------------------------------------- riesgo predicho
with pestana_riesgo:
    st.markdown(
        f"Probabilidad de que cada titular **no pague la cuota de {c.mes_es(c.ahora())}** dentro de los 30 días de gracia. "
        "La lista sirve para llamar o recordar **antes** de que la deuda crezca."
    )
    f1, f2 = st.columns([2, 1])
    niveles = f1.segmented_control("Nivel de riesgo", ["Alto", "Medio", "Bajo"], default=["Alto", "Medio"], selection_mode="multi")
    solo_preventivo = f2.toggle("Solo quienes aún no son morosos", value=False,
                                help="Los que hoy están al día o en gracia: donde la prevención tiene más efecto")

    t = prediccion[prediccion["nivel"].isin(niveles or [])].copy()
    t["pct_pagadas_tarde"] = t["pct_pagadas_tarde"] * 100
    if solo_preventivo:
        t = t[t["estado_pago"] != "VENCIDO"]

    st.dataframe(
        t[["numero_socio", "socio", "lote", "probabilidad", "nivel", "estado_pago", "cuotas_impagas",
           "pct_pagadas_tarde", "retraso_promedio", "deuda_actual"]],
        hide_index=True, height=420,
        column_config={
            "numero_socio": "N° Socio", "socio": "Titular", "lote": "Lote",
            "probabilidad": st.column_config.ProgressColumn("Riesgo", format="percent", min_value=0, max_value=1),
            "nivel": "Nivel",
            "estado_pago": st.column_config.TextColumn("Estado hoy"),
            "cuotas_impagas": st.column_config.NumberColumn("Cuotas vencidas", format="%d"),
            "pct_pagadas_tarde": st.column_config.NumberColumn("Pagos tardíos", format="%.0f %%"),
            "retraso_promedio": st.column_config.NumberColumn("Retraso prom. (días)", format="%.0f"),
            "deuda_actual": st.column_config.NumberColumn("Deuda vencida", format="S/ %.2f"),
        },
    )
    st.download_button(
        "Descargar lista (CSV)", t.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"riesgo_morosidad_{c.ahora():%Y%m%d}.csv", mime="text/csv", icon=":material/download:",
    )

# ---------------------------------------------------------------- cuentas vencidas
with pestana_vencidas:
    col1, col2 = st.columns([1, 1.6])
    with col1, st.container(border=True):
        st.subheader("Deuda por antigüedad")
        tramos = pd.cut(vencidos["dias_mora_max"], bins=[30, 60, 90, 180, 10_000],
                        labels=["31-60 días", "61-90 días", "91-180 días", "Más de 180"], right=True)
        resumen = vencidos.groupby(tramos, observed=False)["deuda_vencida"].agg(["count", "sum"]).reset_index()
        fig = go.Figure(go.Bar(
            x=resumen["dias_mora_max"].astype(str), y=resumen["sum"], marker_color=c.ESTADO["VENCIDO"],
            text=[f"{n} socios" for n in resumen["count"]], textposition="outside", cliponaxis=False,
            hovertemplate="%{x}: S/ %{y:,.2f}<extra></extra>",
        ))
        fig.update_yaxes(tickprefix="S/ ")
        st.plotly_chart(c.estilo(fig, 300, leyenda=False), config={"displayModeBar": False})
    with col2:
        st.dataframe(
            cuentas[cuentas["estado_pago"].isin(["VENCIDO", "PENDIENTE"])]
            .sort_values("dias_mora_max", ascending=False)
            [["numero_socio", "socio", "lote", "estado_pago", "deuda_vencida", "cuotas_vencidas", "dias_mora_max"]],
            hide_index=True, height=360,
            column_config={
                "numero_socio": "N° Socio", "socio": "Titular", "lote": "Lote", "estado_pago": "Estado",
                "deuda_vencida": st.column_config.NumberColumn("Deuda vencida", format="S/ %.2f"),
                "cuotas_vencidas": "Cuotas", "dias_mora_max": "Días de mora",
            },
        )
    st.caption("PENDIENTE: cuota vencida dentro de los 30 días de gracia. VENCIDO: más de 30 días; bloquea reservas, no el ingreso.")

# ---------------------------------------------------------------- explicación del modelo
with pestana_modelo:
    m, base = resultado.metricas, resultado.metricas_regla_simple
    st.markdown(
        f"""
**Pregunta:** ¿el titular dejará de pagar la cuota del mes dentro de los 30 días de gracia?

**Datos:** {resultado.filas_entrenamiento:,} ejemplos de entrenamiento (cortes de
{resultado.cortes_entrenamiento[0]:%m/%Y} a {resultado.cortes_entrenamiento[-1]:%m/%Y}) y
{resultado.filas_prueba:,} de prueba ({resultado.cortes_prueba[0]:%m/%Y} y {resultado.cortes_prueba[-1]:%m/%Y}).
La prueba usa **meses posteriores** al entrenamiento, como ocurriría en la realidad, y cada variable se calcula
solo con pagos registrados **antes** de la fecha de corte (sin "ver el futuro").

**Modelo:** regresión logística con variables estandarizadas. Se eligió por ser interpretable y porque
sus probabilidades están calibradas: la probabilidad media predicha ({m['prob_media']:.1%}) coincide con la
morosidad real ({m['tasa_real']:.1%}).
"""
    )
    k = st.columns(4)
    k[0].metric("AUC", f"{m['auc']:.3f}", delta=f"{m['auc'] - base['auc']:+.3f} vs regla simple", border=True)
    k[1].metric("Precisión en el 10 % de mayor riesgo", f"{m['precision_top10']:.0%}",
                delta=f"{m['precision_top10'] / m['tasa_real']:.1f}× la tasa base", delta_color="off", delta_arrow="off", border=True)
    k[2].metric(f"Precisión (umbral {riesgo.UMBRAL_ALTO:.0%})", f"{m['precision']:.0%}", border=True,
                help="De los marcados como riesgo alto, cuántos realmente cayeron en mora")
    k[3].metric(f"Cobertura (umbral {riesgo.UMBRAL_ALTO:.0%})", f"{m['recall']:.0%}", border=True,
                help="De todos los que cayeron en mora, cuántos fueron marcados como riesgo alto")

    col1, col2 = st.columns([1.4, 1])
    with col1, st.container(border=True):
        st.subheader("¿Qué variables pesan más?")
        imp = resultado.importancia.sort_values("importancia")
        fig = go.Figure(go.Bar(
            x=imp["importancia"], y=imp["descripcion"], orientation="h", marker_color=c.VERDE,
            hovertemplate="%{y}<br>Caída del AUC al desordenarla: %{x:.3f}<extra></extra>",
        ))
        st.plotly_chart(c.estilo(fig, 340, leyenda=False), config={"displayModeBar": False})
        st.caption("Importancia por permutación: cuánto empeora el AUC si se desordena esa variable en los datos de prueba.")
    with col2, st.container(border=True):
        st.subheader("Matriz de confusión (prueba)")
        mc = resultado.matriz_confusion
        st.dataframe(pd.DataFrame(
            {"Predicho: paga": [mc[0][0], mc[1][0]], "Predicho: moroso": [mc[0][1], mc[1][1]]},
            index=["Real: pagó", "Real: moroso"]))
        st.subheader("Comparación con la regla simple")
        st.dataframe(pd.DataFrame({
            "Métrica": ["AUC", "Precisión top 10 %", "Error de calibración (Brier)"],
            "Modelo": [f"{m['auc']:.3f}", f"{m['precision_top10']:.0%}", f"{m['brier']:.3f}"],
            "Regla simple": [f"{base['auc']:.3f}", f"{base['precision_top10']:.0%}", f"{base['brier']:.3f}"],
        }), hide_index=True)

    st.info(
        "Limitación: los datos son una simulación con tres perfiles de pago (puntual, irregular y moroso). "
        "Con datos reales del club el modelo debe reentrenarse y sus métricas volver a medirse.",
        icon=":material/science:",
    )
    if st.button("Reentrenar ahora", icon=":material/model_training:"):
        cache.modelo_riesgo.clear()
        st.rerun()
