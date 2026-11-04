#include "Pantalla.h"

Pantalla::Pantalla() : lcd_(LCD_DIRECCION_I2C, LCD_COLUMNAS, LCD_FILAS) {}

void Pantalla::iniciar() {
  lcd_.init();
  lcd_.backlight();
  lcd_.clear();
}

void Pantalla::mostrar(const String& linea1, const String& linea2) {
  const String l1 = ajustar(linea1);
  const String l2 = ajustar(linea2);
  if (l1 == linea1_ && l2 == linea2_) return;  // nada cambió: no se redibuja

  // Se escribe la línea completa rellenada con espacios en vez de lcd.clear(),
  // que es lento (~2 ms) y produce un parpadeo visible.
  lcd_.setCursor(0, 0);
  lcd_.print(l1);
  lcd_.setCursor(0, 1);
  lcd_.print(l2);
  linea1_ = l1;
  linea2_ = l2;
}

String Pantalla::ajustar(const String& texto) {
  String limpio = sinTildes(texto);
  if (limpio.length() > LCD_COLUMNAS) limpio = limpio.substring(0, LCD_COLUMNAS);
  while (limpio.length() < LCD_COLUMNAS) limpio += ' ';
  return limpio;
}

String Pantalla::sinTildes(const String& texto) {
  // Pares UTF-8 (2 bytes) -> letra ASCII equivalente
  static const char* const kOrigen[] = {"á", "é", "í", "ó", "ú", "Á", "É", "Í", "Ó", "Ú",
                                        "ñ", "Ñ", "ü", "Ü"};
  static const char kDestino[] = {'a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U',
                                  'n', 'N', 'u', 'U'};
  String resultado = texto;
  for (size_t i = 0; i < sizeof(kDestino); i++) {
    resultado.replace(kOrigen[i], String(kDestino[i]));
  }
  return resultado;
}
