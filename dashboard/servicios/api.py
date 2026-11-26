"""
Cliente de la API del backend para las ACCIONES del panel (publicar noticias,
registrar pagos, crear bloqueos, generar planillas...). El panel nunca escribe
directo en la base de datos: así toda escritura pasa por las mismas reglas de
negocio y validaciones que la app móvil.
"""
from __future__ import annotations

from typing import Any

import requests

from . import config


class ErrorApi(Exception):
    def __init__(self, estado: int, codigo: str, mensaje: str):
        super().__init__(mensaje)
        self.estado = estado
        self.codigo = codigo


def _solicitud(metodo: str, ruta: str, token: str | None = None, cuerpo: Any = None) -> Any:
    try:
        respuesta = requests.request(
            metodo,
            f"{config.API_URL}{ruta}",
            json=cuerpo,
            headers={"Authorization": f"Bearer {token}"} if token else {},
            timeout=15,
        )
    except requests.RequestException as e:
        raise ErrorApi(0, "SIN_CONEXION", f"No se pudo conectar con la API ({config.API_URL}): {e}") from e

    if respuesta.status_code == 204:
        return None
    try:
        datos = respuesta.json()
    except ValueError:
        datos = {}
    if not respuesta.ok:
        error = datos.get("error", {}) if isinstance(datos, dict) else {}
        raise ErrorApi(respuesta.status_code, error.get("codigo", "ERROR"), error.get("mensaje", f"Error {respuesta.status_code}"))
    return datos


def iniciar_sesion(login: str, password: str) -> dict:
    return _solicitud("POST", "/auth/login", cuerpo={"login": login, "password": password})


def get(ruta: str, token: str) -> Any:
    return _solicitud("GET", ruta, token)


def post(ruta: str, token: str, cuerpo: Any = None) -> Any:
    return _solicitud("POST", ruta, token, cuerpo or {})


def patch(ruta: str, token: str, cuerpo: Any = None) -> Any:
    return _solicitud("PATCH", ruta, token, cuerpo or {})


def delete(ruta: str, token: str) -> Any:
    return _solicitud("DELETE", ruta, token)


# ------------------------------------------------------------------ imágenes
TIPOS_IMAGEN = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
TAMANO_MAXIMO = 5 * 1024 * 1024


def subir_imagen(token: str, datos: bytes, nombre: str = "imagen.jpg") -> str:
    """Sube la imagen al backend y devuelve su ruta ("archivos/<uuid>.jpg") para guardarla en imagen_url."""
    if len(datos) > TAMANO_MAXIMO:
        raise ErrorApi(413, "SOLICITUD_DEMASIADO_GRANDE", "La imagen supera los 5 MB")
    tipo = TIPOS_IMAGEN.get(nombre.rsplit(".", 1)[-1].lower(), "application/octet-stream")
    try:
        respuesta = requests.post(f"{config.API_URL}/archivos", data=datos, timeout=30,
                                  headers={"Authorization": f"Bearer {token}", "Content-Type": tipo})
    except requests.RequestException as e:
        raise ErrorApi(0, "SIN_CONEXION", f"No se pudo conectar con la API ({config.API_URL}): {e}") from e
    if not respuesta.ok:
        try:
            error = respuesta.json().get("error", {})
        except ValueError:
            error = {}
        raise ErrorApi(respuesta.status_code, error.get("codigo", "ERROR"), error.get("mensaje", f"Error {respuesta.status_code}"))
    return respuesta.json()["ruta"]


def url_imagen(ruta: str | None) -> str | None:
    """URL completa de una imagen guardada como ruta relativa (o la URL externa tal cual)."""
    if not ruta:
        return None
    return ruta if ruta.startswith("http") else f"{config.API_URL}/{ruta}"


def descargar_imagen(ruta: str | None) -> bytes | None:
    """
    Descarga la imagen desde el servidor del panel. El panel no puede pasar al
    navegador la URL interna de Docker (http://backend:3000), así que entrega los bytes.
    """
    url = url_imagen(ruta)
    if not url:
        return None
    try:
        respuesta = requests.get(url, timeout=10)
        return respuesta.content if respuesta.ok else None
    except requests.RequestException:
        return None
