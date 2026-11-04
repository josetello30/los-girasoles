# Sprint 2 · Backend (API REST)

**Objetivo del sprint:** exponer las reglas del club como una API REST segura en Node.js + Express,
lista para que la consuman la app móvil (Sprint 4), la garita IoT (Sprint 3) y el dashboard (Sprint 5).

## Historias completadas

| ID | Historia | Criterio de aceptación | Estado |
|---|---|---|---|
| HU-07 | Como socio quiero iniciar sesión con mi número de socio | JWT de 8 h; mensaje genérico ante error; bloqueo tras 10 intentos | ✅ |
| HU-08 | Como socio quiero ver qué horarios están libres | Disponibilidad por franja con mantenimiento y aforo (piscina) | ✅ |
| HU-09 | Como socio quiero reservar y pagar desde la app | Reserva PENDIENTE → pago aprobado → CONFIRMADA | ✅ |
| HU-10 | Como club quiero que los morosos no reserven | 403 `MOROSIDAD` con el monto vencido | ✅ |
| HU-11 | Como socio quiero entrar con un QR que no se pueda copiar | QR de 5 min y un solo uso | ✅ |
| HU-12 | Como garita quiero validar tarjetas RFID en menos de 2 s | `POST /accesos/validar` con API key; p95 medido | ✅ |
| HU-13 | Como socio quiero registrar a mis invitados | QR válido solo el día de la visita; 8 por mes | ✅ |
| HU-14 | Como socio quiero ver noticias, eventos e inscribirme | Olimpiadas con cupos y sin doble inscripción | ✅ |
| HU-15 | Como socio quiero comprar merchandising (simulado) | Control de stock con bloqueo de filas | ✅ |
| HU-16 | Como administrador quiero generar la planilla (simulada) | Generar, consultar y cerrar por periodo | ✅ |

## Arquitectura del backend

```
backend/src/
├── app.js / server.js      # construcción de Express y arranque con apagado ordenado
├── config/env.js           # configuración validada al iniciar
├── db/index.js             # pool, transacciones, parámetros de negocio
├── middlewares/            # JWT y roles, API key de garitas, validación zod, errores, registro
├── modules/<módulo>/       # rutas + servicio por dominio
│   auth, socios, reservas, pagos, accesos, invitados, comunicacion, tienda, nomina
├── tareas/programadas.js   # cuotas mensuales, cierre y liberación de reservas
└── utils/                  # errores, hashes, fechas en hora de Lima
```

## Decisiones técnicas

1. **Rol de mínimo privilegio.** La API se conecta como `girasoles_app`: no puede alterar el esquema
   ni borrar el log de accesos o los pagos, aunque el código tuviera un error.
2. **Las reglas de integridad viven en la BD; las de negocio, en la API.** Un solapamiento lo impide
   PostgreSQL (`EXCLUDE`); la morosidad la decide la API leyendo un parámetro configurable.
3. **Errores de PostgreSQL traducidos.** Los códigos `GRxxx` de los triggers se convierten en HTTP
   409/422 con mensajes en español para el usuario.
4. **QR de un solo uso con `UPDATE … RETURNING`.** Si dos garitas leen el mismo QR a la vez,
   solo una lo consume.
5. **Garitas autenticadas por API key** cacheada 60 s para no consultar la BD en cada lectura.
6. **Pasarela simulada** con tarjetas de prueba al estilo de Culqi/Niubiz sandbox. Nunca se guarda el número de tarjeta.
7. **Optimización medida:** la disponibilidad de instalaciones bajó de ~350 ms a ~50 ms filtrando primero
   las reservas del día.

## Evidencias para el informe

`make test-api` ejecuta **56 pruebas automáticas** (Jest + Supertest) contra PostgreSQL real:

| Archivo | Pruebas | Cubre |
|---|---|---|
| `auth.test.js` | 11 | Login, sesión, autorización por rol |
| `accesos.test.js` | 15 | API key, RFID, QR (uso único, expirado, inventado), RNF02 |
| `reservas-pagos.test.js` | 18 | Disponibilidad, ciclo reservar→pagar→cancelar, morosidad, límites, pasarela |
| `servicios.test.js` | 12 | Salud, invitados, noticias, eventos, tienda |

Medición del RNF02 (100 validaciones consecutivas en el entorno de desarrollo):
**promedio 4.7 ms, p95 6.8 ms, máximo 13.2 ms** frente a un umbral de 2000 ms.
La latencia de red del ESP32 se medirá en el Sprint 3.
