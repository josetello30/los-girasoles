"""
Accesos en vivo (RF05): registro de la garita IoT que se actualiza solo cada
5 segundos, y evidencia del RNF02 (validación de acceso en menos de 2 segundos).
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Accesos en vivo", "Garitas IoT: tarjetas RFID y QR dinámicos. Se actualiza cada 5 segundos.")


@st.fragment(run_every="5s")
def registro_en_vivo():
    hoy = cache.resumen_accesos_hoy()
    k = st.columns(5)
    k[0].metric("Ingresos hoy", int(hoy.ingresos or 0), border=True)
    k[1].metric("Salidas hoy", int(hoy.salidas or 0), border=True)
    k[2].metric("Denegados hoy", int(hoy.denegados or 0), border=True)
    k[3].metric("Invitados hoy", int(hoy.invitados or 0), border=True)
    if hoy.p95_ms is None or hoy.p95_ms != hoy.p95_ms:  # sin accesos hoy (None o NaN)
        k[4].metric("Latencia p95 hoy", "—", border=True)
    else:
        p95 = float(hoy.p95_ms)
        k[4].metric("Latencia p95 hoy", f"{p95:.0f} ms", border=True,
                    delta="Cumple RNF02" if p95 < 2000 else "No cumple RNF02",
                    delta_color="normal" if p95 < 2000 else "inverse", delta_arrow="off",
                    help="Meta del RNF02: menos de 2000 ms")

    filtro = st.segmented_control("Mostrar", ["Todos", "Solo denegados"], default="Todos", key="filtro_accesos")
    a = cache.accesos_recientes(200 if filtro == "Solo denegados" else 30)
    if filtro == "Solo denegados":
        a = a[a["resultado"] == "DENEGADO"].head(30)
    if a.empty:
        c.sin_datos("Sin accesos registrados")
        return
    a["hora"] = pd.to_datetime(a["ocurrido_en"]).dt.tz_convert("America/Lima").dt.strftime("%d/%m %H:%M:%S")
    a["resultado"] = a["resultado"].map({"PERMITIDO": "✅ Permitido", "DENEGADO": "⛔ Denegado"})
    a[["lote", "motivo"]] = a[["lote", "motivo"]].fillna("—")
    st.dataframe(
        a[["hora", "punto_acceso", "tipo_persona", "persona", "lote", "metodo", "direccion", "resultado", "motivo", "latencia_ms"]],
        hide_index=True, height=460,
        column_config={
            "hora": "Fecha y hora", "punto_acceso": "Garita", "tipo_persona": "Tipo", "persona": "Persona",
            "lote": "Lote", "metodo": "Método", "direccion": "Sentido", "resultado": "Resultado", "motivo": "Motivo",
            "latencia_ms": st.column_config.NumberColumn("Latencia", format="%d ms"),
        },
    )
    st.caption(f"Última actualización: {c.ahora():%H:%M:%S}")


registro_en_vivo()

# ---------------------------------------------------------------- análisis
col1, col2 = st.columns(2)

with col1, st.container(border=True):
    st.subheader("Accesos por hora (últimos 7 días)")
    h = cache.accesos_por_hora(7)
    if h.empty:
        c.sin_datos()
    else:
        por_hora = h.groupby("hora")[["permitidos", "denegados"]].sum().reindex(range(24), fill_value=0) / 7
        fig = go.Figure([
            go.Bar(x=por_hora.index, y=por_hora["permitidos"], name="Permitidos", marker_color=c.SERIES[0],
                   hovertemplate="%{x}:00 · %{y:.0f} permitidos por día<extra></extra>"),
            go.Bar(x=por_hora.index, y=por_hora["denegados"], name="Denegados", marker_color=c.SERIES[1],
                   hovertemplate="%{x}:00 · %{y:.1f} denegados por día<extra></extra>"),
        ])
        fig.update_layout(barmode="stack", bargap=0.2, legend_traceorder="normal")
        fig.update_xaxes(tickvals=list(range(0, 24, 3)), ticktext=[f"{x}:00" for x in range(0, 24, 3)])
        st.plotly_chart(c.estilo(fig, 320), config={"displayModeBar": False})
        st.caption("Promedio diario por hora: picos al salir al trabajo y al volver.")

with col2, st.container(border=True):
    st.subheader("RNF02: tiempo de validación")
    lat = cache.latencias(7)
    if lat.empty:
        c.sin_datos()
    else:
        p95 = lat["latencia_ms"].quantile(0.95)
        cumple = (lat["latencia_ms"] < 2000).mean()
        fig = go.Figure(go.Histogram(
            x=lat["latencia_ms"], nbinsx=40, marker_color=c.VERDE,
            hovertemplate="%{x} ms: %{y} lecturas<extra></extra>",
        ))
        fig.add_vline(x=p95, line_dash="dash", line_color=c.TINTA_SUAVE,
                      annotation_text=f"p95 = {p95:.0f} ms", annotation_position="top right")
        fig.update_xaxes(ticksuffix=" ms")
        st.plotly_chart(c.estilo(fig, 280, leyenda=False), config={"displayModeBar": False})
        st.success(f"{cumple:.1%} de {len(lat):,} validaciones de la última semana tardaron menos de 2000 ms.",
                   icon=":material/speed:")
