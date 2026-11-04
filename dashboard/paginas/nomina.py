"""
Nómina (simulada): planillas mensuales del personal con la asistencia
registrada por las garitas IoT. Generar y cerrar se hace vía API.
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Nómina", "Planilla del personal (simulada con fines académicos)")

planillas = c.accion_api("get", "/nomina")
if planillas is None:
    st.stop()
pl = pd.DataFrame(planillas)

if not pl.empty:
    ultima = pl.iloc[0]
    k = st.columns(4)
    k[0].metric("Trabajadores", int(ultima["trabajadores"]), border=True)
    k[1].metric(f"Sueldos brutos {ultima['periodo']}", c.soles(ultima["total_bruto"]), border=True)
    k[2].metric("Neto a pagar", c.soles(ultima["total_neto"]), border=True)
    k[3].metric("EsSalud (empleador)", c.soles(ultima["total_essalud"]), border=True)

    st.dataframe(pl[["periodo", "estado", "trabajadores", "total_bruto", "total_descuentos", "total_neto", "total_essalud"]],
                 hide_index=True, column_config={
                     "periodo": "Periodo", "estado": "Estado", "trabajadores": "Trabajadores",
                     "total_bruto": st.column_config.NumberColumn("Bruto", format="S/ %.2f"),
                     "total_descuentos": st.column_config.NumberColumn("ONP/AFP", format="S/ %.2f"),
                     "total_neto": st.column_config.NumberColumn("Neto", format="S/ %.2f"),
                     "total_essalud": st.column_config.NumberColumn("EsSalud", format="S/ %.2f"),
                 })

col1, col2 = st.columns([1.4, 1])
with col1, st.container(border=True):
    st.subheader("Boletas")
    periodos = pl["periodo"].tolist() if not pl.empty else []
    actual = f"{c.ahora():%Y-%m}"
    periodo = st.selectbox("Periodo", periodos or [actual])
    boletas = c.accion_api("get", f"/nomina/{periodo}") if periodo in periodos else None
    if boletas:
        st.dataframe(pd.DataFrame(boletas)[["trabajador", "cargo", "dias_asistidos", "regimen_pension", "sueldo_base",
                                            "descuento_pension", "monto_neto", "aporte_essalud"]],
                     hide_index=True, height=360, column_config={
                         "trabajador": "Trabajador", "cargo": "Cargo", "dias_asistidos": "Días asistidos",
                         "regimen_pension": "Régimen",
                         "sueldo_base": st.column_config.NumberColumn("Sueldo", format="S/ %.2f"),
                         "descuento_pension": st.column_config.NumberColumn("Descuento", format="S/ %.2f"),
                         "monto_neto": st.column_config.NumberColumn("Neto", format="S/ %.2f"),
                         "aporte_essalud": st.column_config.NumberColumn("EsSalud", format="S/ %.2f"),
                     })
    estado = pl.loc[pl["periodo"] == periodo, "estado"].iloc[0] if periodo in periodos else None
    a, b = st.columns(2)
    if estado != "CERRADA" and a.button("Generar / recalcular", icon=":material/calculate:", width="stretch"):
        if c.accion_api("post", f"/nomina/{periodo}/generar", exito=f"Planilla {periodo} calculada"):
            st.rerun()
    if estado == "BORRADOR" and b.button("Cerrar planilla", type="primary", icon=":material/lock:", width="stretch"):
        if c.accion_api("post", f"/nomina/{periodo}/cerrar", exito=f"Planilla {periodo} cerrada"):
            st.rerun()
    if estado == "CERRADA":
        st.caption("Planilla cerrada: sus montos ya no cambian.")

with col2, st.container(border=True):
    st.subheader("Asistencia (últimos 30 días)")
    a = cache.asistencia(30)
    if a.empty:
        c.sin_datos()
    else:
        por_cargo = a.groupby("cargo")["dias_asistidos"].mean().sort_values()
        fig = go.Figure(go.Bar(x=por_cargo.values, y=[x.capitalize() for x in por_cargo.index], orientation="h",
                               marker_color=c.VERDE, text=[f"{v:.1f}" for v in por_cargo.values],
                               textposition="outside", cliponaxis=False,
                               hovertemplate="%{y}: %{x:.1f} días en promedio<extra></extra>"))
        st.plotly_chart(c.estilo(fig, 260, leyenda=False), config={"displayModeBar": False})
        st.caption("Días con al menos un ingreso por garita (RFID). Es el dato que usa la planilla.")

st.info("Tasas referenciales: ONP 13 %, AFP 11.37 % (fondo + prima + comisión), EsSalud 9 % a cargo del empleador. "
        "Se configuran en la tabla `parametro`. No constituye asesoría laboral.", icon=":material/info:")
