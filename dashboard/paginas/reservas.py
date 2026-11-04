"""
Reservas: demanda por día y hora, ocupación, agenda del día y cierres por mantenimiento.
"""
from datetime import datetime, time, timedelta

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Reservas", "Uso de las instalaciones del club")

k = cache.kpis()
o = cache.ocupacion()
r = cache.recaudacion_mensual()
mes = pd.Timestamp(c.ahora().date()).to_period("M").to_timestamp()
ingresos_reservas = r[(pd.to_datetime(r["mes"]) == mes) & (r["concepto"] == "RESERVA")]["total"].sum()

col = st.columns(3)
col[0].metric("Reservas del mes", f"{int(k.reservas_mes):,}", border=True)
col[1].metric("Ocupación promedio (30 días)", f"{o['ocupacion_pct'].mean():.0f} %", border=True)
col[2].metric("Ingresos por reservas (mes)", c.soles(ingresos_reservas), border=True)

# ---------------------------------------------------------------- mapa de calor
with st.container(border=True):
    st.subheader("¿Cuándo se reserva más? (canchas y cabañas, últimos 60 días)")
    m = cache.mapa_calor_reservas(60)
    if m.empty:
        c.sin_datos()
    else:
        tabla = m.pivot_table(index="dia", columns="hora", values="reservas", fill_value=0).reindex(range(1, 8), fill_value=0)
        dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        fig = go.Figure(go.Heatmap(
            z=tabla.values, x=[f"{h}:00" for h in tabla.columns], y=dias,
            colorscale=[[i / (len(c.SECUENCIAL) - 1), col_] for i, col_ in enumerate(c.SECUENCIAL)],
            xgap=2, ygap=2, colorbar=dict(title="Reservas", thickness=12),
            hovertemplate="%{y} %{x}: %{z} reservas<extra></extra>",
        ))
        fig.update_yaxes(autorange="reversed", showgrid=False)
        st.plotly_chart(c.estilo(fig, 330, leyenda=False), config={"displayModeBar": False})
        st.caption("Los fines de semana y las tardes concentran la demanda: buen momento para programar mantenimientos entre semana por la mañana.")

col1, col2 = st.columns([1, 1.2])
with col1, st.container(border=True):
    st.subheader("Ocupación por instalación")
    st.dataframe(
        o[["nombre", "ocupacion_pct", "horas_reservadas"]], hide_index=True, height=420,
        column_config={
            "nombre": "Instalación",
            "ocupacion_pct": st.column_config.ProgressColumn("Ocupación", format="%.0f %%", min_value=0, max_value=100),
            "horas_reservadas": st.column_config.NumberColumn("Horas reservadas", format="%.0f"),
        },
    )

with col2, st.container(border=True):
    st.subheader("Agenda del día")
    fecha = st.date_input("Fecha", value=c.ahora().date(), format="DD/MM/YYYY")
    ag = cache.agenda(fecha)
    if ag.empty:
        c.sin_datos("Sin reservas de canchas o cabañas ese día")
    else:
        st.dataframe(
            ag, hide_index=True, height=340,
            column_config={"hora": "Hora", "instalacion": "Instalación", "numero_socio": "N° Socio", "socio": "Socio",
                           "estado": "Estado", "monto": st.column_config.NumberColumn("Monto", format="S/ %.2f")},
        )

# ---------------------------------------------------------------- bloqueos
with st.container(border=True):
    st.subheader("Cerrar una instalación (mantenimiento o evento privado)")
    inst = cache.instalaciones()
    with st.form("bloqueo", clear_on_submit=True, border=False):
        a, b, d = st.columns([1.4, 1, 1])
        nombre = a.selectbox("Instalación", inst["nombre"])
        dia_desde = b.date_input("Desde", value=c.ahora().date() + timedelta(days=1), format="DD/MM/YYYY")
        dia_hasta = d.date_input("Hasta (inclusive)", value=c.ahora().date() + timedelta(days=1), format="DD/MM/YYYY")
        motivo = st.text_input("Motivo", placeholder="Ej. Pintado de la losa deportiva")
        if st.form_submit_button("Programar cierre", type="primary", icon=":material/block:"):
            if dia_hasta < dia_desde or len(motivo.strip()) < 3:
                st.error("Revisa las fechas y escribe un motivo.")
            else:
                inicio = datetime.combine(dia_desde, time.min, tzinfo=c.ZONA)
                fin = datetime.combine(dia_hasta + timedelta(days=1), time.min, tzinfo=c.ZONA)
                iid = inst.loc[inst["nombre"] == nombre, "id"].iloc[0]
                c.accion_api("post", f"/instalaciones/{iid}/bloqueos",
                             {"desde": inicio.isoformat(), "hasta": fin.isoformat(), "motivo": motivo.strip()},
                             exito=f"{nombre} cerrada del {dia_desde:%d/%m} al {dia_hasta:%d/%m}")
    st.caption("Las reservas ya hechas en esas fechas no se cancelan automáticamente; la app deja de ofrecer esos horarios.")
    b = cache.bloqueos()
    if not b.empty:
        b["desde"] = pd.to_datetime(b["desde"]).dt.tz_convert("America/Lima").dt.strftime("%d/%m/%Y %H:%M")
        b["hasta"] = pd.to_datetime(b["hasta"]).dt.tz_convert("America/Lima").dt.strftime("%d/%m/%Y %H:%M")
        st.dataframe(b, hide_index=True, column_config={"instalacion": "Instalación", "desde": "Desde", "hasta": "Hasta", "motivo": "Motivo"})
