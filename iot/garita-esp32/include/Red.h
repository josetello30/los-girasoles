/**
 * Red.h - Conexión WiFi con reconexión automática no bloqueante.
 */
#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include "config.h"

class Red {
 public:
  /** Conecta al inicio, esperando como máximo WIFI_TIMEOUT_MS. */
  bool conectar();
  /** Llamar en cada loop(): si se perdió la conexión, reintenta cada WIFI_REINTENTO_MS. */
  void mantener();
  bool conectada() const { return WiFi.status() == WL_CONNECTED; }
  String ip() const { return WiFi.localIP().toString(); }

 private:
  unsigned long ultimoIntento_ = 0;
  bool estabaConectada_ = false;
};
