"""
Lector de QR con cámara web para la garita simulada en Wokwi.

Wokwi no puede usar la cámara de la PC, así que este programa hace de "módulo
lector de QR" externo, igual que en una garita real donde un lector (p. ej. un
GM65) se conecta al ESP32 por su puerto serie (UART):

    Celular (app)  ->  cámara web  ->  este programa  ->  puerto serie del ESP32
       QR GIR1:...       OpenCV          TCP :4000           (Wokwi, RFC2217)

El firmware ya valida cualquier línea que empiece con "GIR1:" (Sprint 3), así
que la consulta a la API y la reacción del diagrama (LCD, LEDs, tranquera,
zumbador) ocurren dentro de Wokwi. Este programa además lee la respuesta del
ESP32 y la muestra sobre la imagen de la cámara.

Uso:
    python lector_qr.py                      # cámara 0, Wokwi en localhost:4000
    python lector_qr.py --camara 1           # otra cámara
    python lector_qr.py --camara video.mp4   # un video o una URL de cámara IP
    python lector_qr.py --imagen qr.png      # lee un QR de una imagen y lo envía
"""
from __future__ import annotations

import argparse
import socket
import sys
import threading
import time
from dataclasses import dataclass, field

PREFIJO_QR = "GIR1:"
LARGO_MAXIMO = 190  # el firmware descarta comandos de más de 200 caracteres

# Bytes del protocolo telnet (RFC 854) que usa RFC2217 para negociar opciones
IAC, SE, SB, WILL, WONT, DO, DONT = 255, 240, 250, 251, 252, 253, 254


# ============================================================ lógica pura (probada con pytest)
def extraer_codigo(texto: str | None) -> str | None:
    """Devuelve el código si es un QR de la garita (GIR1:...), o None si no lo es."""
    if not texto:
        return None
    texto = texto.strip()
    if not texto.startswith(PREFIJO_QR) or len(texto) > LARGO_MAXIMO:
        return None
    # Solo ASCII imprimible: evita enviar al ESP32 saltos de línea o bytes raros
    if not all(32 <= ord(c) < 127 for c in texto):
        return None
    return texto


class FiltroTelnet:
    """Quita del flujo recibido las secuencias de negociación telnet/RFC2217."""

    def __init__(self) -> None:
        self._estado = "datos"

    def filtrar(self, datos: bytes) -> bytes:
        salida = bytearray()
        for b in datos:
            if self._estado == "datos":
                if b == IAC:
                    self._estado = "iac"
                else:
                    salida.append(b)
            elif self._estado == "iac":
                if b == IAC:  # IAC IAC = el byte 255 literal
                    salida.append(b)
                    self._estado = "datos"
                elif b in (WILL, WONT, DO, DONT):
                    self._estado = "opcion"
                elif b == SB:
                    self._estado = "sub"
                else:
                    self._estado = "datos"
            elif self._estado == "opcion":
                self._estado = "datos"
            elif self._estado == "sub":
                if b == IAC:
                    self._estado = "sub_iac"
            elif self._estado == "sub_iac":
                self._estado = "datos" if b == SE else "sub"
        return bytes(salida)


@dataclass
class FiltroRepetidos:
    """
    Evita enviar el mismo QR varias veces: la cámara lo ve en muchos cuadros
    seguidos y, además, cada QR de la app es de un solo uso.
    """
    enviados: set[str] = field(default_factory=set)

    def es_nuevo(self, codigo: str) -> bool:
        if codigo in self.enviados:
            return False
        self.enviados.add(codigo)
        return True


@dataclass
class Resultado:
    texto: str
    permitido: bool | None  # None = error de red o del servidor
    hasta: float


def interpretar_linea(linea: str, duracion: float = 4.0) -> Resultado | None:
    """
    Interpreta el registro que imprime el firmware tras validar, por ejemplo:
    [acceso] QR GIR1:abc... ENTRADA -> PERMITIDO (HTTP 200) "Bienvenido Jose" ...
    """
    if not linea.startswith("[acceso] QR"):
        return None
    mensaje = linea.split('"')[1] if linea.count('"') >= 2 else ""
    if "-> PERMITIDO" in linea:
        return Resultado(f"PERMITIDO  {mensaje}", True, time.time() + duracion)
    if "-> DENEGADO" in linea:
        return Resultado(f"DENEGADO  {mensaje}", False, time.time() + duracion)
    return Resultado(f"ERROR  {mensaje}", None, time.time() + duracion)


# ============================================================ conexión con el ESP32 en Wokwi
class PuertoSerieWokwi:
    """
    Cliente del servidor RFC2217 de Wokwi (rfc2217ServerPort en wokwi.toml).
    Para texto se comporta como un socket TCP: se escribe la línea y se leen
    las respuestas del ESP32. Se reconecta solo si la simulación se reinicia.
    """

    def __init__(self, host: str, puerto: int, al_recibir_linea=None) -> None:
        self.host, self.puerto = host, puerto
        self.al_recibir_linea = al_recibir_linea or (lambda linea: None)
        self._sock: socket.socket | None = None
        self._cerrojo = threading.Lock()
        self._activo = True
        self._hilo = threading.Thread(target=self._leer, daemon=True)
        self._hilo.start()

    @property
    def conectado(self) -> bool:
        return self._sock is not None

    def _conectar(self) -> None:
        try:
            s = socket.create_connection((self.host, self.puerto), timeout=2)
            s.settimeout(0.5)
            self._sock = s
            print(f"[lector] Conectado al ESP32 en {self.host}:{self.puerto}")
        except OSError:
            self._sock = None

    def _leer(self) -> None:
        filtro, buffer, aviso = FiltroTelnet(), b"", 0.0
        while self._activo:
            if self._sock is None:
                self._conectar()
                if self._sock is None:
                    if time.time() - aviso > 10:
                        print(f"[lector] Esperando la simulación de Wokwi en {self.host}:{self.puerto}... "
                              "(inicia 'Wokwi: Start Simulator' en VS Code)")
                        aviso = time.time()
                    time.sleep(1.5)
                    continue
            try:
                datos = self._sock.recv(1024)
                if not datos:
                    raise ConnectionError("la simulación se detuvo")
            except socket.timeout:
                continue
            except OSError:
                print("[lector] Se perdió la conexión con Wokwi; reintentando...")
                self._sock = None
                continue
            buffer += filtro.filtrar(datos)
            while b"\n" in buffer:
                linea, buffer = buffer.split(b"\n", 1)
                texto = linea.decode("utf-8", "replace").rstrip("\r")
                if texto:
                    print(f"  ESP32 | {texto}")
                    self.al_recibir_linea(texto)

    def enviar(self, codigo: str) -> bool:
        """Escribe el código en el puerto serie, terminado en salto de línea."""
        with self._cerrojo:
            if self._sock is None:
                return False
            try:
                self._sock.sendall(codigo.encode("ascii") + b"\n")
                return True
            except OSError:
                self._sock = None
                return False

    def cerrar(self) -> None:
        self._activo = False
        if self._sock:
            self._sock.close()


# ============================================================ cámara y detección
def crear_detector():
    import cv2

    # El detector "Aruco" (OpenCV >= 4.8) es más tolerante a reflejos y ángulos de una pantalla
    if hasattr(cv2, "QRCodeDetectorAruco"):
        return cv2.QRCodeDetectorAruco()
    return cv2.QRCodeDetector()


def detectar(detector, cuadro):
    """Devuelve (texto, puntos) del QR en el cuadro, probando también en gris y ampliado."""
    import cv2

    texto, puntos, _ = detector.detectAndDecode(cuadro)
    if texto:
        return texto, puntos
    gris = cv2.cvtColor(cuadro, cv2.COLOR_BGR2GRAY) if cuadro.ndim == 3 else cuadro
    grande = cv2.resize(gris, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_LINEAR)
    texto, puntos, _ = detector.detectAndDecode(grande)
    if texto and puntos is not None:
        puntos = puntos / 1.5
    return texto, puntos


def abrir_camara(fuente: str):
    import cv2

    origen = int(fuente) if fuente.isdigit() else fuente
    camara = cv2.VideoCapture(origen)
    if not camara.isOpened():
        sys.exit(
            f"[lector] No se pudo abrir la cámara '{fuente}'.\n"
            "  - Verifica que la cámara esté conectada a esta máquina (en VirtualBox: Dispositivos > Cámaras web).\n"
            "  - Lista las cámaras con: ls /dev/video*   y prueba con --camara 1, 2...")
    camara.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    camara.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    return camara


def dibujar(cuadro, puntos, estado: str, resultado: Resultado | None, conectado: bool) -> None:
    import cv2
    import numpy as np

    verde, rojo, ambar, blanco = (40, 170, 40), (50, 50, 210), (0, 170, 250), (255, 255, 255)
    if puntos is not None and len(puntos):
        cv2.polylines(cuadro, [np.int32(puntos).reshape(-1, 1, 2)], True, verde, 3)

    alto, ancho = cuadro.shape[:2]
    cv2.rectangle(cuadro, (0, 0), (ancho, 34), (30, 30, 30), -1)
    conexion = "Wokwi conectado" if conectado else "Esperando Wokwi (puerto 4000)..."
    cv2.putText(cuadro, f"Garita Los Girasoles | {conexion}", (10, 23),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, verde if conectado else ambar, 1, cv2.LINE_AA)

    if resultado and time.time() < resultado.hasta:
        color = verde if resultado.permitido else (rojo if resultado.permitido is False else ambar)
        cv2.rectangle(cuadro, (0, alto - 60), (ancho, alto), color, -1)
        cv2.putText(cuadro, resultado.texto[:60], (14, alto - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, blanco, 2, cv2.LINE_AA)
    elif estado:
        cv2.putText(cuadro, estado, (14, alto - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, blanco, 2, cv2.LINE_AA)


# ============================================================ modos de uso
def modo_imagen(ruta: str, puerto: PuertoSerieWokwi) -> int:
    """Lee el QR de una imagen y lo envía (sirve para probar sin cámara)."""
    import cv2

    cuadro = cv2.imread(ruta)
    if cuadro is None:
        print(f"[lector] No se pudo leer la imagen {ruta}")
        return 1
    texto, _ = detectar(crear_detector(), cuadro)
    codigo = extraer_codigo(texto)
    if not codigo:
        print(f"[lector] La imagen no tiene un QR de la garita (leído: {texto!r})")
        return 1
    print(f"[lector] QR leído: {codigo[:20]}...")
    for _ in range(20):  # espera hasta 10 s a que Wokwi esté listo
        if puerto.enviar(codigo):
            time.sleep(4)  # deja ver la respuesta del ESP32
            return 0
        time.sleep(0.5)
    print("[lector] No se pudo enviar: ¿está corriendo la simulación de Wokwi?")
    return 1


def modo_camara(fuente: str, puerto: PuertoSerieWokwi, ventana: bool, estado_compartido: dict) -> int:
    import cv2

    camara, detector, repetidos = abrir_camara(fuente), crear_detector(), FiltroRepetidos()
    estado, estado_hasta, cuadro_n = "Muestre el QR de la app a la camara", 0.0, 0
    print("[lector] Cámara lista. Muestra el QR de la app. Salir: tecla Q o Ctrl+C.")
    try:
        while True:
            ok, cuadro = camara.read()
            if not ok:
                if not fuente.isdigit():  # fin de un video de prueba
                    break
                time.sleep(0.05)
                continue
            cuadro_n += 1
            puntos = None
            if cuadro_n % 2 == 0:  # analizar 1 de cada 2 cuadros alcanza y ahorra CPU
                texto, puntos = detectar(detector, cuadro)
                codigo = extraer_codigo(texto)
                if texto and not codigo:
                    estado, estado_hasta = "Ese QR no es de la garita", time.time() + 2
                elif codigo and repetidos.es_nuevo(codigo):
                    if puerto.enviar(codigo):
                        print(f"[lector] QR enviado al ESP32: {codigo[:20]}...")
                        estado, estado_hasta = "Validando...", time.time() + 5
                    else:
                        repetidos.enviados.discard(codigo)  # se reintentará cuando Wokwi conecte
                        estado, estado_hasta = "Inicie la simulacion de Wokwi", time.time() + 2
                elif codigo:
                    estado, estado_hasta = "QR ya leido: genere uno nuevo en la app", time.time() + 2
            if time.time() > estado_hasta:
                estado = "Muestre el QR de la app a la camara"
            if ventana:
                dibujar(cuadro, puntos, estado, estado_compartido.get("resultado"), puerto.conectado)
                cv2.imshow("Garita - lector QR", cuadro)
                if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q"), 27):
                    break
    except KeyboardInterrupt:
        pass
    finally:
        camara.release()
        if ventana:
            cv2.destroyAllWindows()
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Lector de QR con cámara web para la garita en Wokwi")
    p.add_argument("--camara", default="0", help="índice de la cámara (0, 1...), archivo de video o URL")
    p.add_argument("--host", default="localhost", help="host del servidor RFC2217 de Wokwi")
    p.add_argument("--puerto", type=int, default=4000, help="rfc2217ServerPort de wokwi.toml")
    p.add_argument("--imagen", help="leer el QR de una imagen en vez de la cámara")
    p.add_argument("--sin-ventana", action="store_true", help="no mostrar la ventana de la cámara")
    args = p.parse_args(argv)

    estado: dict = {}

    def al_recibir(linea: str) -> None:
        r = interpretar_linea(linea)
        if r:
            estado["resultado"] = r

    puerto = PuertoSerieWokwi(args.host, args.puerto, al_recibir)
    try:
        if args.imagen:
            return modo_imagen(args.imagen, puerto)
        return modo_camara(args.camara, puerto, not args.sin_ventana, estado)
    finally:
        puerto.cerrar()


if __name__ == "__main__":
    sys.exit(main())
