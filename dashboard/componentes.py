"""
Piezas visuales compartidas: colores, estilo de gráficos Plotly, encabezados
y utilidades de sesión del administrador.

Colores (método del skill de visualización):
- Series categóricas: paleta validada para daltonismo, siempre en el mismo orden.
- Una sola serie: el verde del club.
- Estados de pago: paleta de estado (bien / advertencia / crítico), siempre con
  su etiqueta de texto, nunca solo el color.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import plotly.graph_objects as go
import streamlit as st

from servicios import api

ZONA = ZoneInfo("America/Lima")

VERDE = "#14591A"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
ESTADO = {"AL_DIA": "#0ca30c", "PENDIENTE": "#fab219", "VENCIDO": "#d03b3b"}
TEXTO_ESTADO = {"AL_DIA": "Al día", "PENDIENTE": "Pendiente", "VENCIDO": "Vencido"}
NIVEL = {"Alto": "#d03b3b", "Medio": "#fab219", "Bajo": "#0ca30c"}
SECUENCIAL = ["#EEF5EC", "#C9E3C4", "#93C78A", "#55A04C", "#2E7D32", "#14591A"]  # un solo tono, claro -> oscuro
TINTA = "#1F2421"
TINTA_SUAVE = "#6B6A63"
REJILLA = "#ECEAE3"


MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def mes_es(fecha) -> str:
    """Nombre del mes en español (el servidor puede no tener el idioma instalado)."""
    return MESES[fecha.month - 1]


def soles(valor: float | int | None) -> str:
    return f"S/ {float(valor or 0):,.2f}"


def ahora() -> datetime:
    return datetime.now(ZONA)


def estilo(fig: go.Figure, alto: int = 320, leyenda: bool = True) -> go.Figure:
    """Estilo común: marcas delgadas, rejilla discreta, tipografía del panel."""
    fig.update_layout(
        height=alto,
        margin=dict(l=8, r=8, t=8 if not leyenda else 36, b=8),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=TINTA, size=13),
        showlegend=leyenda,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0, title=None),
        hoverlabel=dict(bgcolor="white", font_size=13),
        barcornerradius=4,
        bargap=0.35,
    )
    fig.update_xaxes(showgrid=False, linecolor=REJILLA, tickfont=dict(color=TINTA_SUAVE))
    fig.update_yaxes(gridcolor=REJILLA, zeroline=False, tickfont=dict(color=TINTA_SUAVE))
    return fig


def encabezado(titulo: str, subtitulo: str = "") -> None:
    col1, col2 = st.columns([4, 1], vertical_alignment="bottom")
    with col1:
        st.title(titulo)
        if subtitulo:
            st.caption(subtitulo)
    with col2:
        if st.button("Actualizar", icon=":material/refresh:", width="stretch", key=f"refrescar_{titulo}"):
            st.cache_data.clear()
            st.rerun()


def token() -> str:
    return st.session_state["sesion"]["token"]


def accion_api(metodo: str, ruta: str, cuerpo=None, exito: str | None = None):
    """Ejecuta una acción en la API mostrando el error en español si falla."""
    try:
        llamada = {"post": api.post, "patch": api.patch, "delete": api.delete, "get": api.get}[metodo]
        resultado = llamada(ruta, token(), cuerpo) if metodo in ("post", "patch") else llamada(ruta, token())
    except api.ErrorApi as e:
        if e.estado == 401:
            st.session_state.pop("sesion", None)
            st.warning("Tu sesión expiró. Vuelve a iniciar sesión.")
            st.rerun()
        st.error(e, icon=":material/error:")
        return None
    if exito:
        st.toast(exito, icon=":material/check_circle:")
        st.cache_data.clear()
    return resultado


def sin_datos(mensaje: str = "Sin datos para mostrar") -> None:
    st.info(mensaje, icon=":material/info:")
