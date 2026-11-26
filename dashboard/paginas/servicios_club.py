"""
Servicios del club (restaurante, capilla, posta médica...): foto, descripción,
horario y teléfono que los socios ven en la app.
"""
import streamlit as st

import componentes as c
from servicios import api

c.encabezado("Servicios del club", "Ficha de cada servicio tal como aparece en la app")

try:
    servicios = api.get("/servicios", c.token())
except api.ErrorApi as e:
    if e.estado == 401:
        st.session_state.pop("sesion", None)
        st.rerun()
    st.error(f"No se pudieron cargar los servicios: {e}", icon=":material/error:")
    st.stop()

ICONO = {"RESTAURANTE": ":material/restaurant:", "CAPILLA": ":material/church:", "POSTA": ":material/medical_services:"}

for s in servicios:
    with st.container(border=True):
        col_img, col_form = st.columns([1, 2], gap="medium")
        with col_img:
            st.subheader(s["nombre"])
            c.mostrar_imagen(s.get("imagen_url"), alto_vacio=200, texto_vacio="Sin foto: la app muestra un ícono")
        with col_form, st.form(f"servicio_{s['id']}", border=False):
            descripcion = st.text_area("Descripción", s["descripcion"], height=90, max_chars=1000)
            a, b = st.columns([2, 1])
            horario = a.text_input("Horario", s["horario"], max_chars=120)
            telefono = b.text_input("Teléfono", s.get("telefono") or "", max_chars=15)
            foto = c.selector_imagen("Cambiar foto", clave=f"foto_servicio_{s['id']}")
            quitar = st.checkbox("Quitar la foto actual", key=f"quitar_{s['id']}", disabled=not s.get("imagen_url"))
            if st.form_submit_button("Guardar", type="primary", icon=ICONO.get(s["tipo"], ":material/save:")):
                cuerpo = {"descripcion": descripcion.strip(), "horario": horario.strip(),
                          "telefono": telefono.strip() or None}
                if foto is not None:
                    ruta = c.subir_imagen(foto)
                    if ruta:
                        cuerpo["imagen_url"] = ruta
                elif quitar:
                    cuerpo["imagen_url"] = None
                if c.accion_api("patch", f"/servicios/{s['id']}", cuerpo, exito=f"{s['nombre']} actualizado") is not None:
                    st.rerun()

st.caption("Los cambios se ven en la app al volver a abrir la ficha del servicio.")
