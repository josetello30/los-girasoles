"""
Pagos: recaudación mensual, medios de pago y registro de pagos en ventanilla
(efectivo o transferencia) a través de la API.
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Pagos", "Recaudación y cobranza")

r = cache.recaudacion_mensual()
r["mes"] = pd.to_datetime(r["mes"])
mes = pd.Timestamp(c.ahora().date()).to_period("M").to_timestamp()
del_mes = r[r["mes"] == mes]
ultimos12 = r[r["mes"] > mes - pd.DateOffset(months=12)]
en_linea = ultimos12[ultimos12["metodo"].isin(["TARJETA", "YAPE_PLIN"])]["total"].sum() / max(ultimos12["total"].sum(), 1)

k = st.columns(3)
k[0].metric("Recaudado este mes", c.soles(del_mes["total"].sum()), border=True)
k[1].metric("Recaudado (12 meses)", c.soles(ultimos12["total"].sum()), border=True)
k[2].metric("Pagos digitales (12 meses)", f"{en_linea:.0%}", border=True,
            help="Tarjeta y Yape/Plin sobre el total: antes del sistema todo era en efectivo")

col1, col2 = st.columns([1.5, 1])
with col1, st.container(border=True):
    st.subheader("Recaudación mensual")
    total = r.groupby("mes")["total"].sum().reset_index()
    total = total[total["mes"] < mes]  # el mes en curso está incompleto
    fig = go.Figure(go.Scatter(
        x=total["mes"], y=total["total"], mode="lines+markers", line=dict(color=c.VERDE, width=2),
        marker=dict(size=8, color=c.VERDE, line=dict(color="white", width=2)),
        hovertemplate="%{x|%B %Y}: S/ %{y:,.2f}<extra></extra>",
    ))
    fig.update_yaxes(tickprefix="S/ ", rangemode="tozero")
    fig.update_xaxes(tickformat="%b %Y")
    st.plotly_chart(c.estilo(fig, 320, leyenda=False), config={"displayModeBar": False})
    st.caption("Meses completos. Incluye mantenimiento, reservas y tienda.")

with col2, st.container(border=True):
    st.subheader("Medios de pago (12 meses)")
    nombres = {"EFECTIVO": "Efectivo", "YAPE_PLIN": "Yape / Plin", "TARJETA": "Tarjeta", "TRANSFERENCIA": "Transferencia"}
    medios = ultimos12.groupby("metodo")["total"].sum().sort_values()
    fig = go.Figure(go.Bar(
        x=medios.values, y=[nombres.get(m, m) for m in medios.index], orientation="h", marker_color=c.VERDE,
        text=[f"{v / medios.sum():.0%}" for v in medios.values], textposition="outside", cliponaxis=False,
        hovertemplate="%{y}: S/ %{x:,.2f}<extra></extra>",
    ))
    fig.update_xaxes(tickprefix="S/ ", range=[0, medios.max() * 1.2])
    st.plotly_chart(c.estilo(fig, 320, leyenda=False), config={"displayModeBar": False})

# ---------------------------------------------------------------- ventanilla
with st.container(border=True):
    st.subheader("Registrar pago en ventanilla")
    st.caption("Para socios que pagan en efectivo o por transferencia en administración.")
    cuentas = cache.estado_cuenta()
    con_deuda = cuentas[cuentas["deuda_total"] > 0]
    opciones = {f"{f.numero_socio} · {f.socio} · {c.soles(f.deuda_total)}": f.socio_id for f in con_deuda.itertuples()}
    elegido = st.selectbox("Titular con saldo", list(opciones), index=None, placeholder="Escribe el número o el nombre del socio")

    if elegido:
        ec = c.accion_api("get", f"/pagos/socio/{opciones[elegido]}/estado-cuenta")
        if ec and ec["por_pagar"]:
            pend = pd.DataFrame(ec["por_pagar"])
            etiquetas = {f"{x.descripcion} · vence {pd.to_datetime(x.fecha_vencimiento):%d/%m/%Y} · saldo {c.soles(x.saldo)}": x.cuota_id
                         for x in pend.itertuples()}
            with st.form("ventanilla", border=False):
                cuota = st.selectbox("Cuota", list(etiquetas))
                a, b = st.columns(2)
                metodo = a.selectbox("Medio", ["EFECTIVO", "TRANSFERENCIA"], format_func=lambda m: m.capitalize())
                referencia = b.text_input("N° de operación / recibo", placeholder="Opcional")
                if st.form_submit_button("Registrar pago del saldo", type="primary", icon=":material/point_of_sale:"):
                    cuerpo = {"cuota_id": etiquetas[cuota], "metodo": metodo}
                    if referencia.strip():
                        cuerpo["referencia"] = referencia.strip()
                    res = c.accion_api("post", "/pagos/ventanilla", cuerpo, exito="Pago registrado")
                    if res:
                        st.success(f"Pago {res['id'][:8]} por {c.soles(res['monto'])} registrado.", icon=":material/receipt_long:")
        elif ec:
            st.success("Este titular no tiene cuotas pendientes.")
