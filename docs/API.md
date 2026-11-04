# API REST · Los Girasoles

Base: `http://localhost:3000/api/v1` · Formato: JSON · Zona horaria: America/Lima

## Autenticación

| Quién | Cómo | Cabecera |
|---|---|---|
| Socios, administradores, guardias | `POST /auth/login` devuelve un JWT válido 8 h | `Authorization: Bearer <token>` |
| Garitas IoT (ESP32) | API key por dispositivo (en la BD solo se guarda su SHA-256) | `X-Device-Key: <clave>` |

Todas las respuestas de error tienen la misma forma:

```json
{ "error": { "codigo": "MOROSIDAD", "mensaje": "Tu cuenta tiene S/ 540.00 vencidos. Regulariza tu pago para reservar" } }
```

| HTTP | Cuándo |
|---|---|
| 400 | Datos con formato inválido (incluye `detalles` por campo) |
| 401 | Sin sesión, sesión vencida o API key inválida |
| 402 | La pasarela rechazó el pago |
| 403 | Sin permiso, socio moroso al reservar, o **acceso denegado en garita** |
| 404 | No existe (o no es tuyo) |
| 409 | Conflicto: horario ya reservado, aforo completo, cuota ya pagada, sin stock |
| 422 | Regla de negocio: fuera de horario, fuera de la ventana de 14 días |
| 429 | Demasiados intentos de login (10 cada 15 min) |

## Endpoints

### Sesión
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público | `{ login, password }` → `{ token, usuario }` |
| GET | `/auth/yo` | todos | Perfil, estado de pago y deuda |
| GET | `/health` | público | Estado de la API y de la BD |

### Control de acceso (IoT)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/accesos/validar` | **garita** (`X-Device-Key`) | `{ uid }` o `{ metodo: "QR", credencial }` → **200** permitido / **403** denegado |
| POST | `/accesos/validar-guardia` | GUARDIA, ADMIN | Igual que el anterior, desde el celular del guardia |
| POST | `/accesos/qr` | SOCIO | Genera el QR dinámico (5 min, un solo uso) |
| GET | `/accesos/recientes` | GUARDIA, ADMIN | Registro en vivo. Filtros: `limite`, `resultado`, `tipo_persona`, `punto` |

Respuesta de `/accesos/validar` (pensada para el LCD 16×2 del ESP32):
```json
{
  "permitido": true,
  "mensaje": "Hola Jose",
  "motivo": null,
  "persona": "José Miguel Quispe Soto",
  "tipo": "SOCIO",
  "lote": "E-47",
  "punto_acceso": "GARITA-PRINCIPAL",
  "registro_id": 13413,
  "latencia_ms": 2
}
```
`mensaje` nunca supera 16 caracteres ni lleva tildes (el LCD HD44780 no las muestra).

### Socios
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/socios/yo/familia` | SOCIO | Titular y dependientes |
| GET | `/socios/yo/credenciales` | SOCIO | Tarjetas RFID |
| POST | `/socios/yo/credenciales/:id/reportar-perdida` | SOCIO | Bloquea la tarjeta al instante |
| GET | `/socios` | ADMIN | Padrón paginado. Filtros: `q`, `tipo`, `estado_pago`, `estado_socio`, `pagina`, `limite` |
| GET | `/socios/:id` | ADMIN, GUARDIA | Ficha con familia y tarjetas |
| PATCH | `/socios/:id/estado` | ADMIN | `{ estado: ACTIVO \| SUSPENDIDO \| BAJA }` |
| PATCH | `/socios/credenciales/:id` | ADMIN | `{ estado: PERDIDA \| REVOCADA }` |

### Instalaciones y reservas
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/instalaciones?fecha=` | todos | Instalaciones con `horarios_disponibles` y estado `LIBRE/LLENO/MANTENIMIENTO` |
| GET | `/instalaciones/:id/disponibilidad?fecha=` | todos | Franjas con `disponible`, `motivo` y `cupos_libres` (piscina) |
| POST | `/instalaciones/:id/bloqueos` | ADMIN | Cierre por mantenimiento `{ desde, hasta, motivo }` |
| POST | `/reservas` | SOCIO | `{ instalacion_id, fecha, hora_inicio }` |
| GET | `/reservas/mias?vigentes=true` | SOCIO | Mis reservas |
| DELETE | `/reservas/:id` | SOCIO (propias), ADMIN | Cancela; anula la cuota si no se pagó |
| GET | `/reservas?fecha=` | ADMIN, GUARDIA | Agenda del día |

Reglas: máximo 14 días de anticipación, 3 reservas vigentes por socio, los titulares **VENCIDOS** (morosos) no reservan.
Las reservas con tarifa quedan `PENDIENTE` y se liberan si no se pagan en 30 minutos.

### Pagos
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/pagos/estado-cuenta` | SOCIO | Resumen, cuotas por pagar e historial de 12 meses |
| GET | `/pagos/historial` | SOCIO | Comprobantes |
| POST | `/pagos` | SOCIO | Pago en línea (pasarela **simulada**) |
| POST | `/pagos/ventanilla` | ADMIN | Pago presencial (efectivo / transferencia) |
| POST | `/pagos/:id/anular` | ADMIN | Los pagos se anulan, nunca se borran |
| GET | `/pagos/socio/:titularId/estado-cuenta` | ADMIN | Estado de cuenta de cualquier titular |

Pago con tarjeta:
```json
{ "cuota_id": "…", "metodo": "TARJETA",
  "tarjeta": { "numero": "4111 1111 1111 1111", "vencimiento": "12/30", "cvv": "123", "titular": "José Quispe" } }
```
Pago con Yape/Plin:
```json
{ "cuota_id": "…", "metodo": "YAPE_PLIN", "billetera": { "celular": "987654321", "codigo_aprobacion": "123456" } }
```

| Dato de prueba | Resultado |
|---|---|
| Tarjeta `4111 1111 1111 1111` | Aprobada |
| Tarjeta `4000 0000 0000 0002` | Rechazada: fondos insuficientes |
| Tarjeta `4000 0000 0000 0069` | Rechazada: tarjeta vencida |
| Yape con código `000000` | Rechazado: código inválido |

El número de tarjeta nunca se guarda: solo los 4 últimos dígitos en el comprobante.

### Invitados
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/invitados` | SOCIO | `{ dni, nombres, apellidos, placa_vehiculo?, fecha_visita }` → QR válido ese día |
| GET | `/invitados/mios` | SOCIO | Visitas registradas |
| GET | `/invitados?fecha=` | ADMIN, GUARDIA | Visitas esperadas en garita |

Límite: 8 invitados por familia al mes.

### Comunicación y servicios
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/noticias` | todos | Vigentes, las importantes primero |
| POST / DELETE | `/noticias`, `/noticias/:id` | ADMIN | Publicar / retirar |
| GET | `/eventos` | todos | Próximos, con `inscritos` y `estoy_inscrito` |
| POST / DELETE | `/eventos/:id/inscripcion` | SOCIO | Inscribirse (`{ disciplina }`) / retirarse |
| POST | `/eventos` | ADMIN | Crear evento |
| GET | `/servicios` | todos | Posta, capilla, restaurante, administración |

### Tienda (simulada)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/tienda/productos` | todos | Catálogo con stock |
| POST | `/tienda/pedidos` | SOCIO | `{ items: [{ producto_id, cantidad }] }` → pedido + cuota a pagar con `POST /pagos` |
| GET | `/tienda/pedidos/mios` | SOCIO | Mis pedidos |

### Nómina (simulada, solo ADMIN)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/nomina` | Planillas con totales |
| GET | `/nomina/:periodo` | Boletas (`periodo` = `AAAA-MM`) |
| POST | `/nomina/:periodo/generar` | Calcula o recalcula un borrador |
| POST | `/nomina/:periodo/cerrar` | Congela la planilla |

## Probar rápido desde la terminal

```bash
# Iniciar sesión como el socio de demo
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"00247","password":"Girasoles2026"}' | jq -r .token)

# Ver mi estado de cuenta
curl -s localhost:3000/api/v1/pagos/estado-cuenta -H "Authorization: Bearer $TOKEN" | jq

# Simular la garita leyendo una tarjeta
curl -s -X POST localhost:3000/api/v1/accesos/validar \
  -H 'X-Device-Key: gir-dev-garita-principal-2026' \
  -H 'Content-Type: application/json' \
  -d '{"uid":"A1B2C3D4"}' | jq
```
(`jq` formatea el JSON: `sudo dnf install jq`.)

## Tareas automáticas (cada 5 minutos)

- Emite las cuotas de mantenimiento del mes (idempotente: no duplica).
- Marca como `COMPLETADA` las reservas confirmadas que ya terminaron.
- Libera las reservas `PENDIENTES` que no se pagaron a tiempo.
