"""
Pruebas del lector QR sin cámara ni Wokwi:
- QR como los que genera la app, también "fotografiados" en una pantalla inclinada.
- Un servidor RFC2217 falso que imita a Wokwi + firmware (negocia telnet y responde).
- El flujo completo con un video de prueba en lugar de la cámara.
"""
import base64
import os
import socket
import threading
import time

import cv2
import numpy as np
import pytest
import qrcode

import lector_qr as lq


# ------------------------------------------------------------------ utilidades
def token_app() -> str:
    """Mismo formato que el backend: GIR1: + 24 bytes aleatorios en base64url."""
    return "GIR1:" + base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")


def imagen_qr(texto: str, modulo: int = 8) -> np.ndarray:
    """QR como el de la app (corrección de errores M, gris oscuro sobre blanco, con margen)."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
    qr.add_data(texto)
    qr.make(fit=True)
    matriz = np.array(qr.get_matrix(), dtype=np.uint8)
    img = np.where(matriz, 38, 255).astype(np.uint8)  # #2B2A26 aprox. en gris
    img = cv2.resize(img, None, fx=modulo, fy=modulo, interpolation=cv2.INTER_NEAREST)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)


def como_foto_de_celular(qr: np.ndarray, angulo: float = 12, brillo: int = -25) -> np.ndarray:
    """Simula la cámara web viendo el celular: fondo, perspectiva, desenfoque, ruido y JPEG."""
    rng = np.random.default_rng(7)
    fondo = np.full((720, 1280, 3), (70, 80, 90), np.uint8)
    h, w = qr.shape[:2]
    origen = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    d = angulo * 3
    destino = np.float32([[460 + d, 170], [820, 150 + d], [840 - d, 560], [440, 540 - d]])
    m = cv2.getPerspectiveTransform(origen, destino)
    foto = cv2.warpPerspective(qr, m, (1280, 720), dst=fondo, borderMode=cv2.BORDER_TRANSPARENT)
    foto = cv2.GaussianBlur(foto, (5, 5), 1.2)
    foto = cv2.convertScaleAbs(foto, alpha=0.9, beta=brillo)
    foto = np.clip(foto.astype(np.int16) + rng.normal(0, 6, foto.shape), 0, 255).astype(np.uint8)
    _, jpg = cv2.imencode(".jpg", foto, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return cv2.imdecode(jpg, cv2.IMREAD_COLOR)


class WokwiFalso:
    """Servidor TCP que imita el RFC2217 de Wokwi y la respuesta del firmware."""

    def __init__(self, permitir: bool = True):
        self.recibido: list[str] = []
        self.permitir = permitir
        self.srv = socket.socket()
        self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(("127.0.0.1", 0))
        self.srv.listen(1)
        self.puerto = self.srv.getsockname()[1]
        threading.Thread(target=self._atender, daemon=True).start()

    def _atender(self):
        con, _ = self.srv.accept()
        # Negociación telnet que envía un servidor RFC2217 al conectar (debe ignorarse)
        con.sendall(bytes([255, 251, 1, 255, 251, 3, 255, 250, 44, 1, 0, 0, 37, 128, 255, 240]))
        con.sendall(b"=== Garita Los Girasoles de Huampani ===\r\n")
        buffer = b""
        while True:
            datos = con.recv(1024)
            if not datos:
                break
            buffer += datos
            while b"\n" in buffer:
                linea, buffer = buffer.split(b"\n", 1)
                texto = linea.decode()
                self.recibido.append(texto)
                veredicto = "PERMITIDO (HTTP 200) \"Bienvenido Jose\"" if self.permitir \
                    else "DENEGADO (HTTP 403) \"QR ya utilizado\""
                con.sendall(f"[acceso] QR {texto[:12]}... ENTRADA -> {veredicto} | total 85 ms\r\n".encode())


def esperar(condicion, segundos=5.0):
    fin = time.time() + segundos
    while time.time() < fin:
        if condicion():
            return True
        time.sleep(0.05)
    return False


# ------------------------------------------------------------------ lógica
@pytest.mark.parametrize("texto,esperado", [
    ("GIR1:abc_DEF-123", "GIR1:abc_DEF-123"),
    ("  GIR1:abc\n", "GIR1:abc"),
    ("https://ejemplo.com", None),
    ("", None),
    (None, None),
    ("GIR1:" + "x" * 300, None),
    ("GIR1:abc\x00def", None),
])
def test_extraer_codigo(texto, esperado):
    assert lq.extraer_codigo(texto) == esperado


def test_filtro_telnet_quita_la_negociacion_y_conserva_el_texto():
    f = lq.FiltroTelnet()
    datos = bytes([255, 251, 1]) + b"hola" + bytes([255, 250, 44, 1, 0, 255, 240]) + b" mundo" + bytes([255, 255])
    # Partido en dos trozos para probar que mantiene el estado entre lecturas
    assert f.filtrar(datos[:5]) + f.filtrar(datos[5:]) == b"hola mundo\xff"


def test_un_qr_no_se_envia_dos_veces():
    filtro = lq.FiltroRepetidos()
    assert filtro.es_nuevo("GIR1:a") and not filtro.es_nuevo("GIR1:a") and filtro.es_nuevo("GIR1:b")


def test_interpreta_la_respuesta_del_firmware():
    ok = lq.interpretar_linea('[acceso] QR GIR1:abc... ENTRADA -> PERMITIDO (HTTP 200) "Bienvenido Jose" Jose | total 85 ms')
    no = lq.interpretar_linea('[acceso] QR GIR1:abc... ENTRADA -> DENEGADO (HTTP 403) "QR ya utilizado"  | total 60 ms')
    err = lq.interpretar_linea('[acceso] QR GIR1:abc... ENTRADA -> ERROR_RED (HTTP -1) "Sin conexion"  | total 5000 ms')
    assert ok.permitido is True and "Bienvenido Jose" in ok.texto
    assert no.permitido is False and "QR ya utilizado" in no.texto
    assert err.permitido is None
    assert lq.interpretar_linea("[acceso] RFID A1B2C3D4 ENTRADA -> PERMITIDO") is None


# ------------------------------------------------------------------ detección con OpenCV
def test_lee_un_qr_de_la_app_en_pantalla():
    codigo = token_app()
    texto, puntos = lq.detectar(lq.crear_detector(), imagen_qr(codigo))
    assert texto == codigo and puntos is not None


@pytest.mark.parametrize("angulo,brillo", [(0, 0), (12, -25), (20, -45), (8, 30)])
def test_lee_el_qr_fotografiado_con_angulo_y_reflejo(angulo, brillo):
    codigo = token_app()
    texto, _ = lq.detectar(lq.crear_detector(), como_foto_de_celular(imagen_qr(codigo), angulo, brillo))
    assert texto == codigo


# ------------------------------------------------------------------ conexión con Wokwi
def test_envia_la_linea_al_esp32_y_recibe_la_respuesta():
    wokwi = WokwiFalso()
    lineas = []
    puerto = lq.PuertoSerieWokwi("127.0.0.1", wokwi.puerto, lineas.append)
    try:
        assert esperar(lambda: puerto.conectado)
        codigo = token_app()
        assert puerto.enviar(codigo)
        assert esperar(lambda: wokwi.recibido == [codigo])
        assert esperar(lambda: any(l.startswith("[acceso] QR") for l in lineas))
        assert lineas[0] == "=== Garita Los Girasoles de Huampani ==="  # sin basura telnet
    finally:
        puerto.cerrar()


def test_sin_wokwi_no_envia_ni_se_cae():
    puerto = lq.PuertoSerieWokwi("127.0.0.1", 1, None)  # nadie escucha en el puerto 1
    try:
        assert puerto.enviar("GIR1:abc") is False
    finally:
        puerto.cerrar()


# ------------------------------------------------------------------ flujo completo
def test_flujo_completo_con_video_en_lugar_de_camara(tmp_path):
    """Video: 10 cuadros vacíos, 40 con el QR (como si se sostuviera el celular) y 10 vacíos."""
    codigo = token_app()
    vacio = como_foto_de_celular(np.full((300, 300, 3), 255, np.uint8))
    con_qr = como_foto_de_celular(imagen_qr(codigo))
    ruta = str(tmp_path / "prueba.avi")
    video = cv2.VideoWriter(ruta, cv2.VideoWriter_fourcc(*"MJPG"), 15, (1280, 720))
    for cuadro in [vacio] * 10 + [con_qr] * 40 + [vacio] * 10:
        video.write(cuadro)
    video.release()

    wokwi = WokwiFalso()
    estado = {}
    puerto = lq.PuertoSerieWokwi("127.0.0.1", wokwi.puerto,
                                 lambda l: estado.__setitem__("resultado", lq.interpretar_linea(l) or estado.get("resultado")))
    try:
        assert esperar(lambda: puerto.conectado)
        assert lq.modo_camara(ruta, puerto, ventana=False, estado_compartido=estado) == 0
        assert esperar(lambda: estado.get("resultado") is not None)
        # Visto en 40 cuadros, enviado UNA sola vez
        assert wokwi.recibido == [codigo]
        assert estado["resultado"].permitido is True
    finally:
        puerto.cerrar()


def test_modo_imagen(tmp_path):
    codigo = token_app()
    ruta = str(tmp_path / "qr.png")
    cv2.imwrite(ruta, como_foto_de_celular(imagen_qr(codigo)))
    wokwi = WokwiFalso(permitir=False)
    puerto = lq.PuertoSerieWokwi("127.0.0.1", wokwi.puerto, None)
    try:
        assert lq.modo_imagen(ruta, puerto) == 0
        assert wokwi.recibido == [codigo]
    finally:
        puerto.cerrar()
