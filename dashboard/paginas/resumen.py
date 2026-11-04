"""
Dashboard principal (RF04 y RF05): KPIs, reservas de la semana, ocupación,
estado de pagos y accesos recientes. Replica el panel del prototipo de Figma.
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Dashboard", f"Club Residencial Los Girasoles · {c.ahora():%d/%m/%Y %H:%M}")

k = cache.kpis()
anterior = cache.kpis_mes_anterior()
pagos = cache.estado_pagos().set_index("estado_pago")
titulares = int(pagos["titulares"].sum()) or 1
al_dia = int(pagos["titulares"].get("AL_DIA", 0))

# ---------------------------------------------------------------- KPIs
fila1 = st.columns(3)
fila1[0].metric("Total socios", f"{int(k.total_socios):,}", help="Socios activos: titulares y dependientes",
                border=True, delta=f"{int(k.titulares)} titulares · {int(k.dependientes)} dependientes", delta_color="off", delta_arrow="off")
fila1[1].metric("Reservas (mes)", f"{int(k.reservas_mes):,}", border=True,
                help="Reservas del mes en curso, incluidas las ya agendadas para los próximos días",
                delta=f"Mes anterior completo: {int(anterior.reservas_mes):,}", delta_color="off", delta_arrow="off")
fila1[2].metric("Recaudado (mes)", c.soles(k.recaudacion_mes), border=True,
                delta=f"{c.soles(float(k.recaudacion_mes) - float(anterior.recaudacion_mes))} vs mismo día del mes anterior")

fila2 = st.columns(3)
fila2[0].metric("Morosidad", f"{float(k.tasa_morosidad_pct or 0):.1f} %", border=True,
                delta=f"{c.soles(k.deuda_vencida_total)} vencidos", delta_color="off", delta_arrow="off",
                help="Titulares con cuotas vencidas por más de 30 días (no pueden reservar; sí ingresar)")
fila2[1].metric("Socios al día", f"{al_dia:,}", border=True,
                delta=f"{al_dia / titulares:.0%} de los titulares", delta_color="off", delta_arrow="off")
fila2[2].metric("Accesos (hoy)", f"{int(k.accesos_hoy):,}", border=True,
                delta=f"Latencia p95: {int(k.latencia_p95_ms or 0)} ms (meta < 2000)", delta_color="off", delta_arrow="off")

# ---------------------------------------------------------------- reservas y ocupación
col_izq, col_der = st.columns([1.15, 1])

with col_izq, st.container(border=True):
    st.subheader("Reservas esta semana")
    r = cache.reservas_por_dia(6, 0)
    if r.empty:
        c.sin_datos()
    else:
        r["fecha"] = pd.to_datetime(r["fecha"])
        dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        r["dia"] = r["fecha"].apply(lambda f: f"{dias[f.weekday()]} {f.day}")
        hoy = r["fecha"].dt.date == c.ahora().date()
        fig = go.Figure(go.Bar(
            x=r["dia"], y=r["reservas"],
            marker_color=[c.VERDE if h else "#8FB98A" for h in hoy],
            text=r["reservas"], textposition="outside", cliponaxis=False,
            hovertemplate="%{x}: %{y} reservas<extra></extra>",
        ))
        st.plotly_chart(c.estilo(fig, 300, leyenda=False), config={"displayModeBar": False})
        st.caption("Incluye las reservas compartidas de la piscina. Hoy en verde oscuro.")

with col_der, st.container(border=True):
    st.subheader("Ocupación por instalación")
    o = cache.ocupacion()
    if o.empty:
        c.sin_datos()
    else:
        o = o.sort_values("ocupacion_pct").tail(8)
        fig = go.Figure(go.Bar(
            x=o["ocupacion_pct"], y=o["nombre"], orientation="h", marker_color=c.VERDE,
            text=[f"{v:.0f} %" for v in o["ocupacion_pct"]], textposition="outside", cliponaxis=False,
            hovertemplate="%{y}: %{x:.1f} % de horas ocupadas<extra></extra>",
        ))
        fig.update_xaxes(range=[0, max(100, o["ocupacion_pct"].max() * 1.15)], ticksuffix=" %")
        st.plotly_chart(c.estilo(fig, 300, leyenda=False), config={"displayModeBar": False})
        st.caption("Horas reservadas / horas disponibles en los últimos 30 días.")

# ---------------------------------------------------------------- pagos y accesos
col_izq, col_der = st.columns([1, 1.15])

with col_izq, st.container(border=True):
    st.subheader(f"Estado de pagos · {c.mes_es(c.ahora()).capitalize()} {c.ahora():%Y}")
    orden = ["AL_DIA", "PENDIENTE", "VENCIDO"]
    p = pagos.reindex(orden).fillna(0)
    fig = go.Figure(go.Pie(
        labels=[c.TEXTO_ESTADO[e] for e in orden], values=p["titulares"], hole=0.62, sort=False,
        marker=dict(colors=[c.ESTADO[e] for e in orden], line=dict(color="white", width=2)),
        textinfo="none", hovertemplate="%{label}: %{value} titulares (%{percent})<extra></extra>",
    ))
    fig.add_annotation(text=f"<b>{al_dia / titulares:.0%}</b><br>al día", showarrow=False, font=dict(size=18))
    st.plotly_chart(c.estilo(fig, 250, leyenda=False), config={"displayModeBar": False})
    tabla = pd.DataFrame({
        "Estado": [c.TEXTO_ESTADO[e] for e in orden],
        "Titulares": p["titulares"].astype(int).values,
        "%": [f"{v / titulares:.0%}" for v in p["titulares"]],
        "Deuda vencida": [c.soles(v) for v in p["deuda_vencida"]],
    })
    st.dataframe(tabla, hide_index=True)

with col_der, st.container(border=True):
    st.subheader("Accesos recientes")
    a = cache.accesos_recientes(8)
    if a.empty:
        c.sin_datos()
    else:
        a["hora"] = pd.to_datetime(a["ocurrido_en"]).dt.tz_convert("America/Lima").dt.strftime("%H:%M")
        a["evento"] = a["direccion"].map({"ENTRADA": "→ Entrada", "SALIDA": "← Salida"})
        a["lote"] = a["lote"].fillna("—")
        st.dataframe(
            a[["hora", "persona", "lote", "evento", "metodo", "resultado"]],
            hide_index=True,
            column_config={
                "hora": "Hora", "persona": "Persona", "lote": "Lote", "evento": "Sentido", "metodo": "Método",
                "resultado": st.column_config.TextColumn("Resultado"),
            },
        )
        st.page_link("paginas/accesos.py", label="Ver registro en vivo", icon=":material/arrow_forward:")

# ---------------------------------------------------------------- morosos
with st.container(border=True):
    st.subheader("Socios con mayor deuda vencida")
    e = cache.estado_cuenta()
    top = e[e["estado_pago"] == "VENCIDO"].sort_values("deuda_vencida", ascending=False).head(6)
    st.dataframe(
        top[["numero_socio", "socio", "lote", "deuda_vencida", "cuotas_vencidas", "dias_mora_max"]],
        hide_index=True,
        column_config={
            "numero_socio": "N° Socio", "socio": "Nombre", "lote": "Lote",
            "deuda_vencida": st.column_config.NumberColumn("Deuda vencida", format="S/ %.2f"),
            "cuotas_vencidas": "Cuotas vencidas", "dias_mora_max": "Días de mora",
        },
    )
    st.page_link("paginas/morosidad.py", label="Ver análisis de morosidad y riesgo (IA)", icon=":material/arrow_forward:")
