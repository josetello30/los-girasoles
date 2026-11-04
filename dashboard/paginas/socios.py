"""
Socios: padrón con búsqueda y filtros, ficha con familia y tarjetas,
y cambio de estado de la membresía (vía API).
"""
import pandas as pd
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Socios", "Padrón de titulares y dependientes")

p = cache.padron()

f1, f2, f3, f4 = st.columns([2, 1, 1, 1])
q = f1.text_input("Buscar", placeholder="Nombre, N° de socio, DNI o lote")
tipo = f2.selectbox("Tipo", ["Todos", "TITULAR", "DEPENDIENTE"], format_func=lambda x: x.capitalize())
pago = f3.selectbox("Estado de pago", ["Todos", "AL_DIA", "PENDIENTE", "VENCIDO"], format_func=lambda x: c.TEXTO_ESTADO.get(x, x))
membresia = f4.selectbox("Membresía", ["Todos", "ACTIVO", "SUSPENDIDO", "BAJA"], format_func=lambda x: x.capitalize())

t = p
if q.strip():
    patron = q.strip().lower()
    t = t[t[["socio", "numero_socio", "dni", "lote"]].fillna("").apply(
        lambda fila: fila.str.lower().str.contains(patron, regex=False)).any(axis=1)]
if tipo != "Todos":
    t = t[t["tipo"] == tipo]
if pago != "Todos":
    t = t[t["estado_pago"] == pago]
if membresia != "Todos":
    t = t[t["estado_socio"] == membresia]

st.caption(f"{len(t):,} de {len(p):,} socios")
seleccion = st.dataframe(
    t[["numero_socio", "socio", "tipo", "dni", "lote", "estado_socio", "estado_pago", "deuda_vencida", "fecha_afiliacion"]],
    hide_index=True, height=380, on_select="rerun", selection_mode="single-row", key="tabla_socios",
    column_config={
        "numero_socio": "N° Socio", "socio": "Nombre", "tipo": "Tipo", "dni": "DNI", "lote": "Lote",
        "estado_socio": "Membresía", "estado_pago": "Estado de pago",
        "deuda_vencida": st.column_config.NumberColumn("Deuda vencida (familia)", format="S/ %.2f"),
        "fecha_afiliacion": st.column_config.DateColumn("Afiliación", format="DD/MM/YYYY"),
    },
)
st.download_button("Descargar padrón filtrado (CSV)", t.to_csv(index=False).encode("utf-8-sig"),
                   file_name="padron_socios.csv", mime="text/csv", icon=":material/download:")

# ---------------------------------------------------------------- ficha del socio
filas = seleccion.selection.rows if seleccion else []
if not filas:
    st.info("Selecciona un socio en la tabla para ver su ficha.", icon=":material/touch_app:")
    st.stop()

socio_id = t.iloc[filas[0]]["socio_id"]
ficha = c.accion_api("get", f"/socios/{socio_id}")
if not ficha:
    st.stop()

with st.container(border=True):
    st.subheader(f"{ficha['nombres']} {ficha['apellidos']} · #{ficha['numero_socio']}")
    d = st.columns(4)
    d[0].metric("Tipo", ficha["tipo"].capitalize())
    d[1].metric("Lote", ficha["lote"] or "—")
    d[2].metric("Estado de pago", c.TEXTO_ESTADO.get(ficha["estado_pago"], ficha["estado_pago"]))
    d[3].metric("Deuda vencida (familia)", c.soles(ficha["deuda_vencida"]))
    st.caption(f"DNI {ficha['dni']} · {ficha.get('email') or 'sin correo'} · {ficha.get('telefono') or 'sin teléfono'}")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("**Familia**")
        st.dataframe(pd.DataFrame(ficha["familia"])[["numero_socio", "nombres", "apellidos", "parentesco", "estado_socio"]],
                     hide_index=True, column_config={"numero_socio": "N°", "nombres": "Nombres", "apellidos": "Apellidos",
                                                    "parentesco": "Parentesco", "estado_socio": "Estado"})
    with col2:
        st.markdown("**Tarjetas RFID**")
        tarjetas = pd.DataFrame(ficha["credenciales"])
        if tarjetas.empty:
            st.caption("Sin tarjetas")
        else:
            st.dataframe(tarjetas[["uid_tarjeta", "estado", "emitida_en"]], hide_index=True,
                         column_config={"uid_tarjeta": "UID", "estado": "Estado",
                                        "emitida_en": st.column_config.DatetimeColumn("Emitida", format="DD/MM/YYYY")})
            activas = tarjetas[tarjetas["estado"] == "ACTIVA"]
            if not activas.empty:
                uid = st.selectbox("Bloquear tarjeta", activas["uid_tarjeta"], index=None, placeholder="Elige una tarjeta activa")
                if uid and st.button("Marcar como perdida", icon=":material/credit_card_off:"):
                    cid = activas.loc[activas["uid_tarjeta"] == uid, "id"].iloc[0]
                    if c.accion_api("patch", f"/socios/credenciales/{cid}", {"estado": "PERDIDA"}, exito=f"Tarjeta {uid} bloqueada"):
                        st.rerun()

    st.markdown("**Membresía**")
    a, b = st.columns([1, 2])
    nuevo = a.selectbox("Cambiar estado", ["ACTIVO", "SUSPENDIDO", "BAJA"],
                        index=["ACTIVO", "SUSPENDIDO", "BAJA"].index(ficha["estado_socio"]), format_func=str.capitalize)
    b.caption("Suspendido o de baja: la garita le niega el ingreso y no puede reservar. "
              "La deuda NUNCA cambia el estado por sí sola.")
    if nuevo != ficha["estado_socio"] and st.button(f"Confirmar cambio a {nuevo.lower()}", type="primary"):
        if c.accion_api("patch", f"/socios/{socio_id}/estado", {"estado": nuevo}, exito="Estado actualizado"):
            st.rerun()
