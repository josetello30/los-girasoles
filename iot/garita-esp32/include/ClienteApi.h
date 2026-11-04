/**
 * ClienteApi.h - Comunicación con el backend: POST /api/v1/accesos/validar
 *
 * Política FAIL-SECURE: ante cualquier error de red o del servidor la respuesta
 * es "no abrir". El guardia puede validar manualmente desde su celular.
 */
#pragma once

#include <Arduino.h>
#include "config.h"

enum class Veredicto {
  PERMITIDO,       // HTTP 200
  DENEGADO,        // HTTP 403: credencial rechazada por una regla de negocio
  ERROR_RED,       // sin WiFi, timeout o servidor inalcanzable
  ERROR_SERVIDOR,  // respuesta inesperada (401 garita no autorizada, 5xx...)
};

struct RespuestaAcceso {
  Veredicto veredicto = Veredicto::ERROR_RED;
  int codigoHttp = 0;
  String mensaje;               // texto corto para el LCD (máx. 16 caracteres)
  String persona;               // nombre completo (solo para el monitor serial)
  String tipo;                  // SOCIO, TRABAJADOR, INVITADO, DESCONOCIDO
  uint32_t latenciaTotalMs = 0;     // medida en el ESP32: ida y vuelta completa (RNF02)
  uint32_t latenciaServidorMs = 0;  // reportada por el backend: solo la decisión
};

class ClienteApi {
 public:
  /**
   * @param credencial UID de la tarjeta ("A1B2C3D4") o contenido del QR ("GIR1:...")
   * @param esQr       true si la credencial viene de un código QR
   * @param salida     true si la persona está saliendo del club
   */
  RespuestaAcceso validar(const String& credencial, bool esQr, bool salida);

  static const char* nombre(Veredicto v);
};
