/**
 * Pantalla.h - LCD 16x2 por I2C de la garita.
 * Solo redibuja cuando el texto cambia (evita parpadeos en el loop).
 */
#pragma once

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

class Pantalla {
 public:
  Pantalla();
  void iniciar();
  /** Muestra dos líneas. Recorta a 16 caracteres y quita tildes (el HD44780 no las tiene). */
  void mostrar(const String& linea1, const String& linea2 = "");

  /** Convierte texto UTF-8 a ASCII simple: 'José Peña' -> 'Jose Pena'. */
  static String sinTildes(const String& texto);

 private:
  LiquidCrystal_I2C lcd_;
  String linea1_;
  String linea2_;
  static String ajustar(const String& texto);
};
