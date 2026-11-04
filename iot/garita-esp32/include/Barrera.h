/**
 * Barrera.h - Actuadores de la garita: tranquera (servo), LEDs y zumbador.
 * Todo es NO bloqueante: abrir() programa el cierre y actualizar() lo ejecuta,
 * así el lector sigue atendiendo tarjetas mientras la tranquera está arriba.
 */
#pragma once

#include <Arduino.h>
#include <ESP32Servo.h>
#include "config.h"

class Barrera {
 public:
  void iniciar();
  /** Acceso permitido: LED verde, pitido agudo y tranquera arriba por TIEMPO_APERTURA_MS. */
  void abrir();
  /** Acceso denegado: LED rojo y pitido grave largo. La tranquera no se mueve. */
  void rechazar();
  /** Error de comunicación: tres pitidos cortos y LED rojo. */
  void alertaError();
  /** Apaga los LEDs (vuelve al estado de reposo). */
  void apagarIndicadores();
  /** Debe llamarse en cada vuelta del loop(): cierra la tranquera y corta los pitidos a tiempo. */
  void actualizar();
  bool estaAbierta() const { return cierreEn_ != 0; }

 private:
  Servo servo_;
  ESP32PWM zumbador_;
  unsigned long cierreEn_ = 0;      // millis() en que debe cerrarse (0 = cerrada)
  unsigned long finPitidoEn_ = 0;   // millis() en que debe callarse el zumbador
  uint8_t pitidosPendientes_ = 0;   // para la alerta de error (pitidos intermitentes)
  unsigned long siguientePitidoEn_ = 0;

  void pitido(double frecuenciaHz, unsigned long duracionMs);
  void silenciar();
};
