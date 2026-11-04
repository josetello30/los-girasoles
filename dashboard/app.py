"""
Panel administrativo - Club Residencial Los Girasoles de Huampaní.

Ejecutar:  streamlit run app.py
Lee la BD con un rol de SOLO LECTURA y realiza las acciones a través de la API.
"""
import streamlit as st
from sqlalchemy.exc import OperationalError

from servicios import api, config

st.set_page_config(
    page_title="Los Girasoles · Panel",
    page_icon="🌻",
    layout="wide",
    initial_sidebar_state="expanded",
)


def pantalla_login() -> None:
    _, centro, _ = st.columns([1, 1.2, 1])
    with centro:
        st.markdown("<div style='height:6vh'></div>", unsafe_allow_html=True)
        st.markdown("## 🌻 Los Girasoles")
        st.caption("Panel administrativo · Club Residencial Huampaní")
        with st.form("login", border=True):
            usuario = st.text_input("Usuario", placeholder="admin")
            clave = st.text_input("Contraseña", type="password")
            entrar = st.form_submit_button("Ingresar", type="primary", width="stretch")
        if entrar:
            try:
                r = api.iniciar_sesion(usuario.strip(), clave)
            except api.ErrorApi as e:
                st.error(e)
                return
            if r["usuario"]["rol"] != "ADMIN":
                st.error("Este panel es solo para administradores.")
                return
            st.session_state["sesion"] = {
                "token": r["token"],
                "nombre": r["usuario"].get("nombre_mostrar") or r["usuario"]["login"],
                "login": r["usuario"]["login"],
            }
            st.rerun()
        st.caption(f"API: {config.API_URL}")


if "sesion" not in st.session_state:
    pantalla_login()
    st.stop()

# ---------------------------------------------------------------- navegación
paginas = {
    "General": [
        st.Page("paginas/resumen.py", title="Dashboard", icon=":material/dashboard:", default=True),
        st.Page("paginas/morosidad.py", title="Morosidad e IA", icon=":material/insights:"),
    ],
    "Operación": [
        st.Page("paginas/accesos.py", title="Accesos en vivo", icon=":material/sensor_door:"),
        st.Page("paginas/reservas.py", title="Reservas", icon=":material/event_available:"),
        st.Page("paginas/pagos.py", title="Pagos", icon=":material/payments:"),
    ],
    "Administración": [
        st.Page("paginas/socios.py", title="Socios", icon=":material/groups:"),
        st.Page("paginas/comunicacion.py", title="Noticias y eventos", icon=":material/campaign:"),
        st.Page("paginas/nomina.py", title="Nómina", icon=":material/badge:"),
    ],
}

st.logo("recursos/logo.png", size="large")

navegacion = st.navigation(paginas)

with st.sidebar:
    st.divider()
    st.caption(f"Sesión: **{st.session_state['sesion']['login']}**")
    if st.button("Cerrar sesión", icon=":material/logout:", width="stretch"):
        st.session_state.pop("sesion", None)
        st.rerun()

try:
    navegacion.run()
except OperationalError as error:
    # La BD no responde (contenedor detenido, credenciales antiguas en .env...):
    # se muestra un mensaje claro en lugar del traceback.
    st.error(
        f"Sin conexión con la base de datos ({config.DB_HOST}:{config.DB_PORT}). "
        "Verifica que el contenedor de PostgreSQL esté activo (`docker compose ps`) y vuelve a intentar.",
        icon=":material/database_off:",
    )
    with st.expander("Detalle técnico"):
        st.code(str(error.orig or error), language="text")
