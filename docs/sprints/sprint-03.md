# Sprint 3 · Garita IoT (ESP32 + RFID en Wokwi)

**Objetivo del sprint:** automatizar el control de acceso con un dispositivo IoT que lea tarjetas RFID,
consulte al backend y opere la tranquera, simulado en Wokwi con hardware equivalente al real.

## Historias completadas

| ID | Historia | Criterio de aceptación | Estado |
|---|---|---|---|
| HU-17 | Como socio quiero entrar acercando mi tarjeta | Tarjeta activa → LCD "Hola <nombre>", LED verde, tranquera 5 s | ✅ |
| HU-18 | Como club quiero bloquear tarjetas perdidas al instante | Tarjeta PERDIDA → "Tarjeta perdida", sin abrir | ✅ |
| HU-19 | Como club quiero que la deuda nunca impida volver a casa | Socio moroso → acceso permitido | ✅ |
| HU-20 | Como administración quiero la asistencia del personal | Tarjeta de limpieza → registro en `log_acceso` | ✅ |
| HU-21 | Como guardia quiero registrar entradas y salidas | Interruptor ENTRADA/SALIDA enviado al backend | ✅ |
| HU-22 | Como club quiero que la garita sea segura ante fallas | Sin red o sin servidor la tranquera **no** se abre | ✅ |
| HU-23 | Como evaluador quiero evidencia del RNF02 | Latencia medida por acceso y comando `estado` | ✅ |

## Hardware simulado (Wokwi)

ESP32 DevKit C v4 · lector **RC522 nativo de Wokwi** (`board-mfrc522`) · LCD 16×2 I2C · servo SG90 ·
LEDs verde y rojo · zumbador pasivo · interruptor deslizante.

El RC522 de Wokwi trae 6 tarjetas. Se registraron sus UIDs en la BD (`database/init/07_tarjetas_wokwi.sql`)
para que cada una demuestre un escenario: permitido, moroso que entra, personal, perdida, no registrada y suspendido.

## Decisiones técnicas

1. **Firmware modular en C++** (6 módulos con responsabilidad única) en lugar de un solo archivo: cada pieza se
   puede explicar, probar y reemplazar (por ejemplo, el LCD por una pantalla OLED) sin tocar las demás.
2. **Fail-secure:** ante error de red o del servidor la tranquera permanece cerrada. Una garita no debe abrir
   cuando no puede verificar a quién deja pasar.
3. **No bloqueante:** cierre de tranquera, pitidos y reconexión WiFi se manejan con `millis()`.
4. **La lógica de decisión vive en el backend**, no en el ESP32: revocar una tarjeta surte efecto en la siguiente
   lectura, en todas las garitas, sin reprogramar dispositivos.
5. **Configuración aislada** en `config.h` y `secretos.h`: pasar a hardware real es cambiar SSID, contraseña e IP.
6. **Compilación verificada** contra Arduino-ESP32 2.0.17 (el core que instala PlatformIO): 828 KB (63 % de la
   flash), 0 advertencias propias con `-Wall`.

## Evidencias para el informe

- Captura del simulador con cada una de las 6 tarjetas (LCD + LED).
- Salida del monitor serial con la línea `[acceso] ... | total N ms | servidor M ms` de cada lectura.
- Comando `estado` en el monitor serial: promedio, mínimo, máximo y porcentaje bajo 2000 ms (RNF02).
- Panel/consulta de `log_acceso`: los intentos aparecen con método RFID, dirección y latencia.
- `make test-api`: **58 pruebas** del backend, incluidas las 6 tarjetas del simulador.

Comprobación de las 6 tarjetas contra el backend (sin simulador, `make tarjeta UID=...`):

| UID | Resultado | Mensaje LCD | Tiempo |
|---|---|---|---|
| A1B2C3D4 | 200 PERMITIDO | Hola Jose | 34 ms (primera, conexión en frío) |
| 11223344 | 200 PERMITIDO | Hola Roberto | 8 ms |
| 55667788 | 200 PERMITIDO | Hola (personal) | 8 ms |
| AABBCCDD | 403 DENEGADO | Tarjeta perdida | 9 ms |
| C0FFEE99 | 403 DENEGADO | No registrada | 5 ms |
| 04112233445566 | 403 DENEGADO | Socio suspendido | 9 ms |
