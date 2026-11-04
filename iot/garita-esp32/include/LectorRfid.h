/**
 * LectorRfid.h - Lector RC522 (MIFARE 13.56 MHz) por SPI.
 * Entrega el UID de la tarjeta en hexadecimal y mayúsculas: "A1B2C3D4".
 * Soporta UIDs de 4 bytes (MIFARE Classic) y 7 bytes (NFC / Ultralight).
 */
#pragma once

#include <Arduino.h>
#include <MFRC522.h>
#include "config.h"

class LectorRfid {
 public:
  LectorRfid();
  /** Inicializa el bus SPI y el lector. Devuelve false si el RC522 no responde (cableado). */
  bool iniciar();
  /** Si hay una tarjeta nueva frente al lector, escribe su UID en `uid` y devuelve true. */
  bool leer(String& uid);
  /** Versión de firmware reportada por el chip (0x91/0x92 en un RC522 real). */
  byte version() const { return version_; }

 private:
  MFRC522 mfrc_;
  byte version_ = 0;
};
