#include "Barrera.h"

void Barrera::iniciar() {
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  apagarIndicadores();

  // ESP32Servo y el zumbador comparten el periférico PWM (LEDC):
  // se reservan los temporizadores para que no se pisen entre sí.
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);

  servo_.setPeriodHertz(50);              // servo estándar: 50 Hz
  servo_.attach(PIN_SERVO, 500, 2400);    // pulso mínimo y máximo en microsegundos
  servo_.write(ANGULO_CERRADA);

  zumbador_.attachPin(PIN_BUZZER, 2000, 10);  // 2 kHz, resolución de 10 bits
  silenciar();
}

void Barrera::abrir() {
  digitalWrite(PIN_LED_ROJO, LOW);
  digitalWrite(PIN_LED_VERDE, HIGH);
  servo_.write(ANGULO_ABIERTA);
  cierreEn_ = millis() + TIEMPO_APERTURA_MS;
  pitido(1800, 150);
}

void Barrera::rechazar() {
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_ROJO, HIGH);
  pitido(400, 700);
}

void Barrera::alertaError() {
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_ROJO, HIGH);
  pitidosPendientes_ = 3;
  siguientePitidoEn_ = millis();
}

void Barrera::apagarIndicadores() {
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_ROJO, LOW);
}

void Barrera::actualizar() {
  const unsigned long ahora = millis();

  // Cierre automático de la tranquera
  if (cierreEn_ != 0 && (long)(ahora - cierreEn_) >= 0) {
    servo_.write(ANGULO_CERRADA);
    digitalWrite(PIN_LED_VERDE, LOW);
    cierreEn_ = 0;
  }

  // Fin del pitido en curso
  if (finPitidoEn_ != 0 && (long)(ahora - finPitidoEn_) >= 0) {
    silenciar();
  }

  // Secuencia de pitidos de error: 3 x (120 ms sonido + 120 ms silencio)
  if (pitidosPendientes_ > 0 && finPitidoEn_ == 0 && (long)(ahora - siguientePitidoEn_) >= 0) {
    pitido(900, 120);
    pitidosPendientes_--;
    siguientePitidoEn_ = ahora + 240;
  }
}

void Barrera::pitido(double frecuenciaHz, unsigned long duracionMs) {
  zumbador_.writeTone(frecuenciaHz);
  finPitidoEn_ = millis() + duracionMs;
}

void Barrera::silenciar() {
  zumbador_.write(0);  // ciclo de trabajo 0 = sin sonido
  finPitidoEn_ = 0;
}
