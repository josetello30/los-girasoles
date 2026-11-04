#include "Red.h"

bool Red::conectar() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // Indicar el canal acelera la conexión al AP virtual de Wokwi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CANAL);
  Serial.printf("[red] Conectando a \"%s\"", WIFI_SSID);

  const unsigned long inicio = millis();
  while (!conectada() && millis() - inicio < WIFI_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  ultimoIntento_ = millis();
  estabaConectada_ = conectada();

  if (estabaConectada_) {
    Serial.printf("[red] Conectado. IP %s | RSSI %d dBm\n", ip().c_str(), WiFi.RSSI());
  } else {
    Serial.println("[red] Sin conexión: se seguirá reintentando en segundo plano");
  }
  return estabaConectada_;
}

void Red::mantener() {
  const bool ahora = conectada();
  if (ahora != estabaConectada_) {
    Serial.println(ahora ? "[red] Conexión recuperada" : "[red] Conexión perdida");
    estabaConectada_ = ahora;
  }
  if (ahora || millis() - ultimoIntento_ < WIFI_REINTENTO_MS) return;

  ultimoIntento_ = millis();
  Serial.println("[red] Reintentando conexión...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CANAL);
}
