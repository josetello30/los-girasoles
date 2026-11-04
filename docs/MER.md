# Modelo Entidad-Relación

Base de datos PostgreSQL 16 del Club Residencial Los Girasoles de Huampaní.
El DDL completo está en [`database/init/02_esquema.sql`](../database/init/02_esquema.sql).
GitHub dibuja automáticamente los diagramas de abajo.

## 1. Personas, seguridad y control de acceso

```mermaid
erDiagram
    USUARIO ||--o| SOCIO : "inicia sesión como"
    USUARIO ||--o| TRABAJADOR : "inicia sesión como"
    SOCIO ||--o{ SOCIO : "titular de (dependientes)"
    SOCIO ||--o{ CREDENCIAL_RFID : "posee"
    TRABAJADOR ||--o{ CREDENCIAL_RFID : "posee"
    SOCIO ||--o{ TOKEN_QR : "genera"
    SOCIO ||--o{ INVITADO : "registra"
    INVITADO ||--o{ TOKEN_QR : "recibe"
    PUNTO_ACCESO ||--o{ LOG_ACCESO : "registra"
    SOCIO ||--o{ LOG_ACCESO : "ingresa"
    TRABAJADOR ||--o{ LOG_ACCESO : "marca asistencia"
    INVITADO ||--o{ LOG_ACCESO : "ingresa"

    USUARIO {
        uuid id PK
        varchar login UK "número de socio, admin, guardia01"
        text password_hash "bcrypt"
        enum rol "SOCIO | ADMIN | GUARDIA"
        bool activo
    }
    SOCIO {
        uuid id PK
        uuid usuario_id FK
        varchar numero_socio UK "00247 / 00247-01"
        enum tipo "TITULAR | DEPENDIENTE"
        uuid titular_id FK
        enum parentesco
        char dni UK
        varchar lote
        enum estado "ACTIVO | SUSPENDIDO | BAJA"
    }
    TRABAJADOR {
        uuid id PK
        uuid usuario_id FK "solo guardias y administrativos"
        enum cargo "GUARDIA | LIMPIEZA | MANTENIMIENTO | JARDINERIA | ADMINISTRATIVO"
        numeric sueldo_base
        enum regimen_pension "ONP | AFP"
    }
    CREDENCIAL_RFID {
        uuid id PK
        varchar uid_tarjeta UK "A1B2C3D4"
        uuid socio_id FK "socio XOR trabajador"
        uuid trabajador_id FK
        enum estado "ACTIVA | REVOCADA | PERDIDA"
    }
    TOKEN_QR {
        uuid id PK
        char token_hash UK "SHA-256"
        timestamptz expira_en "+5 min"
        timestamptz usado_en "un solo uso"
    }
    INVITADO {
        uuid id PK
        uuid socio_anfitrion_id FK
        char dni
        date fecha_visita
    }
    PUNTO_ACCESO {
        uuid id PK
        varchar codigo UK "GARITA-PRINCIPAL"
        enum tipo "VEHICULAR | PEATONAL"
        char api_key_hash "autentica al ESP32"
    }
    LOG_ACCESO {
        bigint id PK
        enum metodo "RFID | QR | MANUAL"
        enum direccion "ENTRADA | SALIDA"
        enum resultado "PERMITIDO | DENEGADO"
        varchar motivo
        int latencia_ms "evidencia RNF02"
        timestamptz ocurrido_en
    }
```

## 2. Reservas, pagos, tienda y nómina

```mermaid
erDiagram
    INSTALACION ||--o{ RESERVA : "se reserva en"
    INSTALACION ||--o{ BLOQUEO_INSTALACION : "se cierra por"
    SOCIO ||--o{ RESERVA : "hace"
    SOCIO ||--o{ CUOTA : "debe (solo titular)"
    CUOTA ||--o{ PAGO : "se cancela con"
    RESERVA |o--o| CUOTA : "genera"
    PEDIDO |o--o| CUOTA : "genera"
    SOCIO ||--o{ PEDIDO : "compra"
    PEDIDO ||--|{ DETALLE_PEDIDO : "contiene"
    PRODUCTO ||--o{ DETALLE_PEDIDO : "aparece en"
    PLANILLA ||--|{ BOLETA : "contiene"
    TRABAJADOR ||--o{ BOLETA : "cobra"
    EVENTO ||--o{ INSCRIPCION_EVENTO : "recibe"
    SOCIO ||--o{ INSCRIPCION_EVENTO : "se inscribe"

    INSTALACION {
        uuid id PK
        varchar codigo UK "FUTBOL-1"
        enum tipo "FUTBOL ... CABANA, CAPILLA, POSTA"
        int capacidad
        bool exclusiva "FALSE = piscina (aforo)"
        numeric tarifa_hora
        time hora_apertura
        time hora_cierre
    }
    RESERVA {
        uuid id PK
        tstzrange periodo "EXCLUDE: sin solapamiento"
        enum estado "PENDIENTE | CONFIRMADA | CANCELADA | COMPLETADA"
        numeric monto
    }
    BLOQUEO_INSTALACION {
        uuid id PK
        tstzrange periodo
        varchar motivo
    }
    CUOTA {
        uuid id PK
        enum concepto "MANTENIMIENTO | RESERVA | EVENTO | TIENDA"
        date periodo
        numeric monto
        date fecha_vencimiento
    }
    PAGO {
        uuid id PK
        numeric monto
        enum metodo "EFECTIVO | TARJETA | YAPE_PLIN | TRANSFERENCIA"
        enum estado "APROBADO | ANULADO"
        timestamptz pagado_en
    }
    PRODUCTO {
        uuid id PK
        varchar sku UK
        numeric precio
        int stock
    }
    PEDIDO {
        uuid id PK
        enum estado
        numeric total "calculado por trigger"
    }
    DETALLE_PEDIDO {
        uuid pedido_id PK
        uuid producto_id PK
        int cantidad
        numeric precio_unitario
    }
    PLANILLA {
        uuid id PK
        date periodo UK
        enum estado "BORRADOR | CERRADA"
    }
    BOLETA {
        uuid id PK
        numeric descuento_pension
        numeric monto_neto
        numeric aporte_essalud
        int dias_asistidos "desde log_acceso"
    }
    EVENTO {
        uuid id PK
        varchar titulo
        enum categoria
        timestamptz inicia_en
        int cupo
    }
    INSCRIPCION_EVENTO {
        uuid evento_id PK
        uuid socio_id PK
        varchar disciplina
    }
```

Tablas de apoyo sin relaciones relevantes: `noticia`, `servicio_club` y `parametro`
(configuración de negocio editable sin redesplegar).

## 3. Reglas de negocio que garantiza la base de datos

| Regla | Mecanismo | Error |
|---|---|---|
| Dos reservas activas no se solapan en canchas y cabañas | `EXCLUDE USING gist` sobre `tstzrange` | 23P01 |
| La piscina no supera su aforo | Trigger + candado transaccional | GR005 |
| No se reserva fuera de horario ni durante mantenimientos | Trigger `fn_validar_reserva` | GR002 / GR004 |
| La deuda siempre es del titular, nunca de un dependiente | Trigger `fn_validar_cuota` | GR010 |
| Un pago no supera el saldo de su cuota (aun con pagos simultáneos) | Trigger con `SELECT ... FOR UPDATE` | GR011 |
| Una sola cuota de mantenimiento por titular y mes | Índice único parcial | 23505 |
| Una tarjeta RFID pertenece a un socio **o** a un trabajador | `CHECK num_nonnulls(...) = 1` | 23514 |
| El log de accesos y los pagos no se editan ni se borran | `REVOKE UPDATE, DELETE` al rol del backend | 42501 |
| El dashboard no ve contraseñas, tokens ni API keys | `REVOKE SELECT` + sesión de solo lectura | 42501 |

Las 19 pruebas automáticas de estas reglas están en
[`database/tests/pruebas_integridad.sql`](../database/tests/pruebas_integridad.sql) (`make test-db`).

## 4. Estado de cuenta (vista `v_estado_cuenta`)

Los estados se **calculan** a partir de cuotas y pagos; no se guardan, así nunca quedan desincronizados.

| Estado | Significado | ¿Puede reservar? | ¿Puede ingresar? |
|---|---|---|---|
| `AL_DIA` | Sin cuotas vencidas (puede tener la cuota del mes aún por vencer) | Sí | Sí |
| `PENDIENTE` | Cuotas vencidas dentro del periodo de gracia (30 días) | Sí | Sí |
| `VENCIDO` | Alguna cuota supera el periodo de gracia: **moroso** | No | **Sí** |

La morosidad **nunca** bloquea el ingreso: es un club residencial y los socios viven ahí.
La garita solo deniega por credencial inválida, revocada o QR expirado.
