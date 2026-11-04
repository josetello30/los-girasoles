#include "ClienteApi.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "secretos.h"

RespuestaAcceso ClienteApi::validar(const String& credencial, bool esQr, bool salida) {
  RespuestaAcceso r;
  const unsigned long inicio = millis();

  if (WiFi.status() != WL_CONNECTED) {
    r.veredicto = Veredicto::ERROR_RED;
    r.mensaje = "Sin conexion";
    return r;
  }

  // ---- Cuerpo de la solicitud
  JsonDocument cuerpo;
  if (esQr) {
    cuerpo["metodo"] = "QR";
    cuerpo["credencial"] = credencial;
  } else {
    cuerpo["metodo"] = "RFID";
    cuerpo["uid"] = credencial;
  }
  cuerpo["direccion"] = salida ? "SALIDA" : "ENTRADA";
  String json;
  serializeJson(cuerpo, json);

  // ---- Envío
  WiFiClient conexion;
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(conexion, String(API_BASE_URL) + API_RUTA_VALIDAR)) {
    r.veredicto = Veredicto::ERROR_RED;
    r.mensaje = "URL invalida";
    return r;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  r.codigoHttp = http.POST(json);
  r.latenciaTotalMs = millis() - inicio;

  // ---- Interpretación
  if (r.codigoHttp <= 0) {
    // Códigos negativos de HTTPClient: conexión rechazada, timeout, etc.
    Serial.printf("[api] Error de red: %s\n", HTTPClient::errorToString(r.codigoHttp).c_str());
    r.veredicto = Veredicto::ERROR_RED;
    r.mensaje = "Servidor caido";
    http.end();
    return r;
  }

  const String respuesta = http.getString();
  http.end();

  if (r.codigoHttp != 200 && r.codigoHttp != 403) {
    Serial.printf("[api] Respuesta inesperada %d: %s\n", r.codigoHttp, respuesta.c_str());
    r.veredicto = Veredicto::ERROR_SERVIDOR;
    r.mensaje = r.codigoHttp == 401 ? "Garita sin clave" : "Error servidor";
    return r;
  }

  JsonDocument datos;
  const DeserializationError error = deserializeJson(datos, respuesta);
  if (error) {
    Serial.printf("[api] JSON inválido: %s\n", error.c_str());
    r.veredicto = Veredicto::ERROR_SERVIDOR;
    r.mensaje = "Resp. invalida";
    return r;
  }

  // El código HTTP manda; el campo 'permitido' se usa como doble verificación.
  const bool permitido = r.codigoHttp == 200 && (datos["permitido"] | false);
  r.veredicto = permitido ? Veredicto::PERMITIDO : Veredicto::DENEGADO;
  r.mensaje = datos["mensaje"] | (permitido ? "Bienvenido" : "Denegado");
  r.persona = datos["persona"] | "";
  r.tipo = datos["tipo"] | "";
  r.latenciaServidorMs = datos["latencia_ms"] | 0;
  return r;
}

const char* ClienteApi::nombre(Veredicto v) {
  switch (v) {
    case Veredicto::PERMITIDO:      return "PERMITIDO";
    case Veredicto::DENEGADO:       return "DENEGADO";
    case Veredicto::ERROR_RED:      return "ERROR_RED";
    case Veredicto::ERROR_SERVIDOR: return "ERROR_SERVIDOR";
  }
  return "?";
}
