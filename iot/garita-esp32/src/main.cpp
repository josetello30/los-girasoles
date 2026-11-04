/**
 * Garita de control de acceso - Club Residencial Los Girasoles de Huampaní
 * ESP32 + lector RFID RC522 + LCD 16x2 + tranquera (servo) + LEDs + zumbador
 *
 * Flujo:
 *   1. El socio acerca su tarjeta (o el guardia ingresa un QR por el monitor serial).
 *   2. El ESP32 envía la credencial al backend: POST /api/v1/accesos/validar.
 *   3. El backend decide, registra el intento en log_acceso y responde.
 *   4. Si es PERMITIDO se levanta la tranquera 5 s; si no, LED rojo y mensaje.
 *
 * Comandos por el monitor serial (útiles en la demo y en las pruebas):
 *   GIR1:xxxx   valida un QR dinámico (copiado de la app del socio)
 *   uid XXXX    simula acercar la tarjeta con ese UID
 *   estado      muestra la red y las métricas de latencia (evidencia del RNF02)
 *   ayuda       lista los comandos
 */
#include <Arduino.h>

#include "Barrera.h"
#include "ClienteApi.h"
#include "LectorRfid.h"
#include "Pantalla.h"
#include "Red.h"
#include "config.h"

// ============================================================ Módulos
Pantalla pantalla;
Barrera barrera;
LectorRfid lector;
Red red;
ClienteApi api;

// ============================================================ Estado
unsigned long mensajeHasta = 0;     // hasta cuándo se mantiene el mensaje del último acceso
String ultimoUid;                   // antirrebote: misma tarjeta frente al lector
unsigned long ultimoUidEn = 0;
String bufferSerial;

// Métricas de la sesión (evidencia del RNF02: latencia < 2000 ms)
struct Metricas {
  uint32_t total = 0, permitidos = 0, denegados = 0, errores = 0;
  uint32_t sumaMs = 0, minMs = UINT32_MAX, maxMs = 0, sobreUmbral = 0;

  void registrar(const RespuestaAcceso& r) {
    total++;
    if (r.veredicto == Veredicto::PERMITIDO) permitidos++;
    else if (r.veredicto == Veredicto::DENEGADO) denegados++;
    else { errores++; return; }  // los errores no cuentan para la latencia
    sumaMs += r.latenciaTotalMs;
    minMs = min(minMs, r.latenciaTotalMs);
    maxMs = max(maxMs, r.latenciaTotalMs);
    if (r.latenciaTotalMs >= 2000) sobreUmbral++;
  }

  void imprimir() const {
    const uint32_t medidas = permitidos + denegados;
    Serial.println(F("------------------------------------------------------------"));
    Serial.printf("[metricas] lecturas %u | permitidos %u | denegados %u | errores %u\n",
                  total, permitidos, denegados, errores);
    if (medidas > 0) {
      Serial.printf("[metricas] latencia total: promedio %u ms | min %u ms | max %u ms\n",
                    sumaMs / medidas, minMs, maxMs);
      Serial.printf("[metricas] RNF02 (< 2000 ms): %u de %u lecturas cumplen (%.1f %%)\n",
                    medidas - sobreUmbral, medidas, 100.0 * (medidas - sobreUmbral) / medidas);
    }
    Serial.println(F("------------------------------------------------------------"));
  }
} metricas;

// ============================================================ Utilidades
bool modoSalida() {
  // Interruptor con pull-up interno: conectado a GND (LOW) = SALIDA
  return digitalRead(PIN_SWITCH_SALIDA) == LOW;
}

void mostrarReposo() {
  if (!red.conectada()) {
    pantalla.mostrar("Sin WiFi", "Reconectando...");
    return;
  }
  pantalla.mostrar("Los Girasoles", modoSalida() ? "SALIDA: acerque" : "Acerque tarjeta");
}

void imprimirAyuda() {
  Serial.println(F("Comandos: 'GIR1:...' valida un QR | 'uid A1B2C3D4' simula una tarjeta | 'estado' | 'ayuda'"));
  Serial.println(F("Tarjetas del simulador: azul A1B2C3D4 (socio) | verde 11223344 (moroso, entra) |"));
  Serial.println(F("  amarilla 55667788 (personal) | roja AABBCCDD (perdida) | llavero C0FFEE99 (no registrada) |"));
  Serial.println(F("  tag NFC 04112233445566 (socio suspendido)"));
}

// ============================================================ Lógica principal
void procesarCredencial(const String& credencial, bool esQr) {
  const bool salida = modoSalida();
  pantalla.mostrar("Validando...", esQr ? "Codigo QR" : credencial);
  barrera.apagarIndicadores();

  const RespuestaAcceso r = api.validar(credencial, esQr, salida);
  metricas.registrar(r);

  // Registro legible y parseable en el monitor serial
  Serial.printf("[acceso] %s %s %s -> %s (HTTP %d) \"%s\" %s | total %u ms | servidor %u ms\n",
                esQr ? "QR" : "RFID",
                esQr ? (credencial.substring(0, 12) + "...").c_str() : credencial.c_str(),
                salida ? "SALIDA" : "ENTRADA",
                ClienteApi::nombre(r.veredicto), r.codigoHttp, r.mensaje.c_str(),
                r.persona.c_str(), r.latenciaTotalMs, r.latenciaServidorMs);

  switch (r.veredicto) {
    case Veredicto::PERMITIDO:
      barrera.abrir();
      pantalla.mostrar(salida ? "SALIDA OK" : "ACCESO PERMITIDO", r.mensaje);
      mensajeHasta = millis() + TIEMPO_APERTURA_MS;
      break;
    case Veredicto::DENEGADO:
      barrera.rechazar();
      pantalla.mostrar("ACCESO DENEGADO", r.mensaje);
      mensajeHasta = millis() + TIEMPO_MENSAJE_MS;
      break;
    default:  // fail-secure: la tranquera NO se abre
      barrera.alertaError();
      pantalla.mostrar(r.mensaje, "Llame al guardia");
      mensajeHasta = millis() + TIEMPO_MENSAJE_MS;
      break;
  }
}

void atenderSerial() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c != '\n' && c != '\r') {
      if (bufferSerial.length() < 200) bufferSerial += c;
      continue;
    }
    String comando = bufferSerial;
    bufferSerial = "";
    comando.trim();
    if (comando.isEmpty()) continue;

    if (comando.startsWith(PREFIJO_QR)) {
      procesarCredencial(comando, true);
    } else if (comando.startsWith("uid ")) {
      String uid = comando.substring(4);
      uid.trim();
      uid.replace(":", "");
      uid.toUpperCase();
      procesarCredencial(uid, false);
    } else if (comando == "estado") {
      Serial.printf("[estado] WiFi %s | IP %s | backend %s\n",
                    red.conectada() ? "conectado" : "desconectado", red.ip().c_str(), API_BASE_URL);
      metricas.imprimir();
    } else {
      imprimirAyuda();
    }
  }
}

// ============================================================ Arduino
void setup() {
  Serial.begin(VELOCIDAD_SERIAL);
  delay(200);
  Serial.println(F("\n=== Garita Los Girasoles de Huampani ==="));

  pinMode(PIN_SWITCH_SALIDA, INPUT_PULLUP);
  pantalla.iniciar();
  pantalla.mostrar("Los Girasoles", "Iniciando...");
  barrera.iniciar();

  if (lector.iniciar()) {
    Serial.printf("[rfid] RC522 listo (version 0x%02X)\n", lector.version());
  } else {
    Serial.printf("[rfid] ERROR: el RC522 no responde (version 0x%02X). Revisa el cableado SPI\n",
                  lector.version());
    pantalla.mostrar("Error lector", "Revisar cableado");
    barrera.alertaError();
  }

  pantalla.mostrar("Conectando WiFi", WIFI_SSID);
  red.conectar();
  Serial.printf("[api] Backend: %s%s\n", API_BASE_URL, API_RUTA_VALIDAR);
  imprimirAyuda();
  mostrarReposo();
}

void loop() {
  red.mantener();
  barrera.actualizar();
  atenderSerial();

  // Vuelve a la pantalla de reposo cuando termina el mensaje del último acceso
  if (mensajeHasta != 0 && (long)(millis() - mensajeHasta) >= 0) {
    mensajeHasta = 0;
    barrera.apagarIndicadores();
  }
  if (mensajeHasta == 0) mostrarReposo();

  String uid;
  if (lector.leer(uid)) {
    // Antirrebote: la misma tarjeta frente al lector no se valida dos veces seguidas
    if (uid == ultimoUid && millis() - ultimoUidEn < ANTIRREBOTE_TARJETA_MS) return;
    ultimoUid = uid;
    ultimoUidEn = millis();
    procesarCredencial(uid, false);
  }
}
