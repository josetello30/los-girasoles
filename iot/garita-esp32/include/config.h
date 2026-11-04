/**
 * config.h - Configuración de la garita IoT del Club Residencial Los Girasoles.
 * Todo lo que podría cambiar entre la simulación (Wokwi) y el hardware real
 * está aquí, para no tocar la lógica del programa.
 */
#pragma once

// ============================================================ Red
// Wokwi ofrece un punto de acceso virtual abierto llamado "Wokwi-GUEST" en el canal 6.
// En hardware real: SSID y contraseña de la red de la garita.
#define WIFI_SSID        "Wokwi-GUEST"
#define WIFI_PASSWORD    ""
#define WIFI_CANAL       6

// 'host.wokwi.internal' es tu PC visto desde dentro del simulador (gateway de Wokwi
// para VS Code). Ahí el backend publica el puerto 3000 con Docker.
// En hardware real: la IP o dominio del servidor, ej. "http://192.168.1.50:3000".
#define API_BASE_URL     "http://host.wokwi.internal:3000"
#define API_RUTA_VALIDAR "/api/v1/accesos/validar"

// RNF02: la validación completa debe tomar menos de 2 s. Se deja margen para la red.
#define HTTP_TIMEOUT_MS          1800
#define WIFI_TIMEOUT_MS          20000
#define WIFI_REINTENTO_MS        5000

// ============================================================ Pines (ESP32 DevKit C)
// Lector RFID RC522 por SPI (bus VSPI por defecto: SCK 18, MISO 19, MOSI 23)
#define PIN_RFID_SS      5
#define PIN_RFID_RST     4

// Pantalla LCD 16x2 con adaptador I2C (SDA 21, SCL 22 por defecto)
#define LCD_DIRECCION_I2C 0x27
#define LCD_COLUMNAS     16
#define LCD_FILAS        2

#define PIN_SERVO        13   // tranquera
#define PIN_LED_VERDE    26
#define PIN_LED_ROJO     27
#define PIN_BUZZER       25
#define PIN_SWITCH_SALIDA 33  // interruptor: ENTRADA / SALIDA (lector de doble sentido)

// ============================================================ Comportamiento
#define ANGULO_CERRADA           0
#define ANGULO_ABIERTA           90
#define TIEMPO_APERTURA_MS       5000   // la tranquera se cierra sola
#define TIEMPO_MENSAJE_MS        2500   // cuánto se muestra "ACCESO DENEGADO"
#define ANTIRREBOTE_TARJETA_MS   3000   // ignora la misma tarjeta si se sigue acercando
#define VELOCIDAD_SERIAL         115200

// Prefijo de los QR dinámicos que genera el backend (POST /accesos/qr)
#define PREFIJO_QR       "GIR1:"
