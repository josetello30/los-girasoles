#include "LectorRfid.h"

#include <SPI.h>

LectorRfid::LectorRfid() : mfrc_(PIN_RFID_SS, PIN_RFID_RST) {}

bool LectorRfid::iniciar() {
  SPI.begin();  // VSPI: SCK 18, MISO 19, MOSI 23
  mfrc_.PCD_Init();
  delay(10);
  version_ = mfrc_.PCD_ReadRegister(MFRC522::VersionReg);
  // 0x00 o 0xFF indican que no hay comunicación SPI (cable suelto o pin equivocado)
  return version_ != 0x00 && version_ != 0xFF;
}

bool LectorRfid::leer(String& uid) {
  if (!mfrc_.PICC_IsNewCardPresent() || !mfrc_.PICC_ReadCardSerial()) return false;

  uid = "";
  for (byte i = 0; i < mfrc_.uid.size; i++) {
    if (mfrc_.uid.uidByte[i] < 0x10) uid += '0';
    uid += String(mfrc_.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  mfrc_.PICC_HaltA();       // detiene la tarjeta para no leerla en bucle
  mfrc_.PCD_StopCrypto1();  // libera el canal cifrado (por si se autenticó un bloque)
  return true;
}
