-- =============================================================================
-- 02_esquema.sql
-- Modelo de datos del Club Residencial Los Girasoles de Huampaní.
--
-- Módulos:
--   A. Seguridad y personas  : usuario, socio, trabajador
--   B. Control de acceso IoT : punto_acceso, credencial_rfid, invitado, token_qr, log_acceso
--   C. Reservas              : instalacion, bloqueo_instalacion, reserva
--   D. Pagos y morosidad     : cuota, pago
--   E. Comunicación          : noticia, evento, inscripcion_evento, servicio_club
--   F. Tienda (simulada)     : producto, pedido, detalle_pedido
--   G. Nómina (simulada)     : planilla, boleta
--   H. Configuración         : parametro
--
-- Convenciones:
--   * Claves primarias UUID (gen_random_uuid), salvo log_acceso (bigint, alto volumen).
--   * Fechas y horas siempre TIMESTAMPTZ; la zona de la BD es America/Lima.
--   * Montos en soles: NUMERIC(10,2), nunca FLOAT.
--   * Las reglas de integridad viven en la BD (CHECK, EXCLUDE, triggers);
--     las reglas de negocio configurables (morosidad, etc.) viven en el backend.
-- =============================================================================

SET TIME ZONE 'America/Lima';

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
CREATE TYPE rol_usuario         AS ENUM ('SOCIO', 'ADMIN', 'GUARDIA');
CREATE TYPE tipo_socio          AS ENUM ('TITULAR', 'DEPENDIENTE');
CREATE TYPE parentesco          AS ENUM ('CONYUGE', 'HIJO', 'PADRE', 'MADRE', 'OTRO');
CREATE TYPE estado_socio        AS ENUM ('ACTIVO', 'SUSPENDIDO', 'BAJA');
CREATE TYPE cargo_trabajador    AS ENUM ('GUARDIA', 'LIMPIEZA', 'MANTENIMIENTO', 'JARDINERIA', 'ADMINISTRATIVO');
CREATE TYPE regimen_pension     AS ENUM ('ONP', 'AFP');

CREATE TYPE tipo_punto_acceso   AS ENUM ('VEHICULAR', 'PEATONAL');
CREATE TYPE estado_credencial   AS ENUM ('ACTIVA', 'REVOCADA', 'PERDIDA');
CREATE TYPE metodo_acceso       AS ENUM ('RFID', 'QR', 'MANUAL');
CREATE TYPE direccion_acceso    AS ENUM ('ENTRADA', 'SALIDA');
CREATE TYPE resultado_acceso    AS ENUM ('PERMITIDO', 'DENEGADO');

CREATE TYPE tipo_instalacion    AS ENUM ('FUTBOL', 'BASQUET', 'VOLEY', 'FRONTON', 'TENIS',
                                         'PISCINA', 'CABANA', 'CAPILLA', 'POSTA');
CREATE TYPE estado_reserva      AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA');

CREATE TYPE concepto_cuota      AS ENUM ('MANTENIMIENTO', 'RESERVA', 'EVENTO', 'TIENDA', 'OTRO');
CREATE TYPE metodo_pago         AS ENUM ('EFECTIVO', 'TARJETA', 'YAPE_PLIN', 'TRANSFERENCIA');
CREATE TYPE estado_pago         AS ENUM ('APROBADO', 'ANULADO');

CREATE TYPE categoria_noticia   AS ENUM ('IMPORTANTE', 'MANTENIMIENTO', 'EVENTO', 'GENERAL');
CREATE TYPE categoria_evento    AS ENUM ('DEPORTE', 'FESTIVAL', 'CULTURAL', 'RELIGIOSO', 'SOCIAL');
CREATE TYPE estado_inscripcion  AS ENUM ('INSCRITO', 'CANCELADO', 'ASISTIO');
CREATE TYPE tipo_servicio       AS ENUM ('POSTA', 'CAPILLA', 'RESTAURANTE', 'ADMINISTRACION', 'OTRO');

CREATE TYPE estado_pedido       AS ENUM ('PENDIENTE_PAGO', 'PAGADO', 'ENTREGADO', 'CANCELADO');
CREATE TYPE estado_planilla     AS ENUM ('BORRADOR', 'CERRADA');

-- -----------------------------------------------------------------------------
-- H. Configuración: parámetros de negocio editables sin redesplegar
-- -----------------------------------------------------------------------------
CREATE TABLE parametro (
    clave        VARCHAR(60)  PRIMARY KEY,
    valor        TEXT         NOT NULL,
    descripcion  TEXT         NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- A. SEGURIDAD Y PERSONAS
-- =============================================================================

-- Credenciales de inicio de sesión. Solo existen para quien usa la app o el panel.
CREATE TABLE usuario (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    login          VARCHAR(40)  NOT NULL UNIQUE,          -- número de socio, o 'admin', 'guardia01'...
    password_hash  TEXT         NOT NULL,                 -- bcrypt; jamás texto plano
    rol            rol_usuario  NOT NULL,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_login   TIMESTAMPTZ,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Socios: titulares (dueños del lote, responsables de la deuda) y sus dependientes.
CREATE TABLE socio (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id       UUID          UNIQUE REFERENCES usuario(id) ON DELETE SET NULL,
    numero_socio     VARCHAR(8)    NOT NULL UNIQUE,       -- '00247' titular, '00247-01' dependiente
    tipo             tipo_socio    NOT NULL,
    titular_id       UUID          REFERENCES socio(id) ON DELETE RESTRICT,
    parentesco       parentesco,
    dni              CHAR(8)       NOT NULL UNIQUE,
    nombres          VARCHAR(80)   NOT NULL,
    apellidos        VARCHAR(80)   NOT NULL,
    lote             VARCHAR(10),
    email            VARCHAR(120),
    telefono         VARCHAR(15),
    fecha_nacimiento DATE,
    estado           estado_socio  NOT NULL DEFAULT 'ACTIVO',
    fecha_afiliacion DATE          NOT NULL DEFAULT CURRENT_DATE,
    creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en   TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT ck_socio_numero   CHECK (numero_socio ~ '^\d{5}(-\d{2})?$'),
    CONSTRAINT ck_socio_dni      CHECK (dni ~ '^\d{8}$'),
    CONSTRAINT ck_socio_email    CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    -- Un titular no depende de nadie y tiene lote; un dependiente siempre tiene titular y parentesco.
    CONSTRAINT ck_socio_jerarquia CHECK (
        (tipo = 'TITULAR'     AND titular_id IS NULL     AND parentesco IS NULL AND lote IS NOT NULL)
     OR (tipo = 'DEPENDIENTE' AND titular_id IS NOT NULL AND parentesco IS NOT NULL)
    ),
    CONSTRAINT ck_socio_no_autorreferencia CHECK (titular_id IS DISTINCT FROM id)
);
CREATE INDEX ix_socio_titular   ON socio (titular_id);
CREATE INDEX ix_socio_apellidos ON socio (apellidos, nombres);

-- Personal del club. Guardias y administrativos pueden tener usuario; limpieza,
-- mantenimiento y jardinería no inician sesión, pero sí marcan ingreso y cobran.
CREATE TABLE trabajador (
    id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID              UNIQUE REFERENCES usuario(id) ON DELETE SET NULL,
    dni             CHAR(8)           NOT NULL UNIQUE,
    nombres         VARCHAR(80)       NOT NULL,
    apellidos       VARCHAR(80)       NOT NULL,
    cargo           cargo_trabajador  NOT NULL,
    sueldo_base     NUMERIC(10,2)     NOT NULL,
    regimen_pension regimen_pension   NOT NULL,
    afp_nombre      VARCHAR(30),
    telefono        VARCHAR(15),
    fecha_ingreso   DATE              NOT NULL,
    activo          BOOLEAN           NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ       NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ       NOT NULL DEFAULT now(),

    CONSTRAINT ck_trabajador_dni    CHECK (dni ~ '^\d{8}$'),
    CONSTRAINT ck_trabajador_sueldo CHECK (sueldo_base > 0),
    CONSTRAINT ck_trabajador_afp    CHECK ((regimen_pension = 'AFP') = (afp_nombre IS NOT NULL))
);

-- =============================================================================
-- B. CONTROL DE ACCESO (IoT)
-- =============================================================================

-- Cada garita física (ESP32) se registra aquí y se autentica con su propia API key.
CREATE TABLE punto_acceso (
    id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo        VARCHAR(30)        NOT NULL UNIQUE,     -- 'GARITA-PRINCIPAL'
    nombre        VARCHAR(80)        NOT NULL,
    tipo          tipo_punto_acceso  NOT NULL,
    api_key_hash  CHAR(64)           NOT NULL,            -- SHA-256 en hexadecimal
    activo        BOOLEAN            NOT NULL DEFAULT TRUE,
    creado_en     TIMESTAMPTZ        NOT NULL DEFAULT now()
);

-- Tarjeta RFID física. Pertenece a un socio O a un trabajador, nunca a ambos.
-- Separada de la persona para poder revocar una tarjeta perdida sin tocar al titular.
CREATE TABLE credencial_rfid (
    id             UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    uid_tarjeta    VARCHAR(20)        NOT NULL UNIQUE,    -- UID MIFARE en hexadecimal: 'A1B2C3D4'
    socio_id       UUID               REFERENCES socio(id) ON DELETE CASCADE,
    trabajador_id  UUID               REFERENCES trabajador(id) ON DELETE CASCADE,
    estado         estado_credencial  NOT NULL DEFAULT 'ACTIVA',
    emitida_en     TIMESTAMPTZ        NOT NULL DEFAULT now(),
    revocada_en    TIMESTAMPTZ,

    CONSTRAINT ck_credencial_uid      CHECK (uid_tarjeta ~ '^[0-9A-F]{8,20}$'),
    CONSTRAINT ck_credencial_duenio   CHECK (num_nonnulls(socio_id, trabajador_id) = 1),
    CONSTRAINT ck_credencial_revocada CHECK ((estado = 'ACTIVA') = (revocada_en IS NULL))
);
CREATE INDEX ix_credencial_socio      ON credencial_rfid (socio_id);
CREATE INDEX ix_credencial_trabajador ON credencial_rfid (trabajador_id);

-- Visitas registradas por un socio desde la app.
CREATE TABLE invitado (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_anfitrion_id  UUID         NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
    dni                 CHAR(8)      NOT NULL,
    nombres             VARCHAR(80)  NOT NULL,
    apellidos           VARCHAR(80)  NOT NULL,
    placa_vehiculo      VARCHAR(10),
    fecha_visita        DATE         NOT NULL,
    creado_en           TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_invitado_dni CHECK (dni ~ '^\d{8}$'),
    CONSTRAINT uq_invitado_visita UNIQUE (socio_anfitrion_id, dni, fecha_visita)
);
CREATE INDEX ix_invitado_fecha ON invitado (fecha_visita);

-- QR dinámico (RF01): válido unos minutos y de un solo uso.
-- Solo se guarda el hash; el token en claro existe únicamente en el celular.
CREATE TABLE token_qr (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id     UUID         REFERENCES socio(id) ON DELETE CASCADE,
    invitado_id  UUID         REFERENCES invitado(id) ON DELETE CASCADE,
    token_hash   CHAR(64)     NOT NULL UNIQUE,
    emitido_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_en    TIMESTAMPTZ  NOT NULL,
    usado_en     TIMESTAMPTZ,

    CONSTRAINT ck_token_duenio  CHECK (num_nonnulls(socio_id, invitado_id) = 1),
    CONSTRAINT ck_token_vigencia CHECK (expira_en > emitido_en),
    CONSTRAINT ck_token_uso     CHECK (usado_en IS NULL OR usado_en >= emitido_en)
);
CREATE INDEX ix_token_qr_socio ON token_qr (socio_id, expira_en DESC);

-- Bitácora de cada intento de ingreso o salida. Es de solo inserción:
-- el rol del backend no puede modificar ni borrar filas (ver 06_roles.sh).
CREATE TABLE log_acceso (
    id               BIGINT            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    punto_acceso_id  UUID              NOT NULL REFERENCES punto_acceso(id),
    socio_id         UUID              REFERENCES socio(id) ON DELETE SET NULL,
    trabajador_id    UUID              REFERENCES trabajador(id) ON DELETE SET NULL,
    invitado_id      UUID              REFERENCES invitado(id) ON DELETE SET NULL,
    metodo           metodo_acceso     NOT NULL,
    credencial_leida VARCHAR(64),                          -- UID o prefijo del token tal como llegó
    direccion        direccion_acceso  NOT NULL DEFAULT 'ENTRADA',
    resultado        resultado_acceso  NOT NULL,
    motivo           VARCHAR(120),                         -- 'Credencial revocada', 'QR expirado'...
    latencia_ms      INTEGER,                              -- evidencia del RNF02 (< 2000 ms)
    ocurrido_en      TIMESTAMPTZ       NOT NULL DEFAULT now(),

    -- Se identifica como máximo a una persona; las tarjetas desconocidas quedan sin dueño.
    CONSTRAINT ck_log_sujeto   CHECK (num_nonnulls(socio_id, trabajador_id, invitado_id) <= 1),
    CONSTRAINT ck_log_latencia CHECK (latencia_ms IS NULL OR latencia_ms >= 0)
);
CREATE INDEX ix_log_acceso_fecha      ON log_acceso (ocurrido_en DESC);
CREATE INDEX ix_log_acceso_socio      ON log_acceso (socio_id, ocurrido_en DESC);
CREATE INDEX ix_log_acceso_trabajador ON log_acceso (trabajador_id, ocurrido_en DESC);

-- =============================================================================
-- C. RESERVAS
-- =============================================================================

CREATE TABLE instalacion (
    id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo            VARCHAR(20)       NOT NULL UNIQUE,  -- 'FUTBOL-1'
    nombre            VARCHAR(60)       NOT NULL,
    tipo              tipo_instalacion  NOT NULL,
    descripcion       TEXT,
    capacidad         INTEGER           NOT NULL DEFAULT 1,
    -- TRUE: un solo grupo por franja (canchas, cabañas). FALSE: varios socios
    -- comparten la franja hasta llenar la capacidad (piscina).
    exclusiva         BOOLEAN           NOT NULL DEFAULT TRUE,
    tarifa_hora       NUMERIC(10,2)     NOT NULL DEFAULT 0,
    hora_apertura     TIME              NOT NULL,
    hora_cierre       TIME              NOT NULL,
    duracion_bloque_min INTEGER         NOT NULL DEFAULT 60,
    imagen_url        TEXT,
    activa            BOOLEAN           NOT NULL DEFAULT TRUE,

    CONSTRAINT ck_instalacion_horario   CHECK (hora_cierre > hora_apertura),
    CONSTRAINT ck_instalacion_capacidad CHECK (capacidad > 0),
    CONSTRAINT ck_instalacion_tarifa    CHECK (tarifa_hora >= 0),
    CONSTRAINT ck_instalacion_bloque    CHECK (duracion_bloque_min IN (30, 60, 120, 240, 480, 600))
);

-- Cierres por mantenimiento o eventos privados (ej. piscina cerrada del 18 al 20).
CREATE TABLE bloqueo_instalacion (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    instalacion_id  UUID         NOT NULL REFERENCES instalacion(id) ON DELETE CASCADE,
    periodo         TSTZRANGE    NOT NULL,
    motivo          VARCHAR(120) NOT NULL,
    creado_por      UUID         REFERENCES usuario(id) ON DELETE SET NULL,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_bloqueo_periodo CHECK (NOT isempty(periodo) AND NOT lower_inf(periodo) AND NOT upper_inf(periodo))
);
CREATE INDEX ix_bloqueo_periodo ON bloqueo_instalacion USING gist (instalacion_id, periodo);

CREATE TABLE reserva (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id        UUID            NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
    instalacion_id  UUID            NOT NULL REFERENCES instalacion(id),
    periodo         TSTZRANGE       NOT NULL,             -- [inicio, fin)
    estado          estado_reserva  NOT NULL DEFAULT 'PENDIENTE',
    monto           NUMERIC(10,2)   NOT NULL DEFAULT 0,
    -- Copia de instalacion.exclusiva, la rellena un trigger. Hace falta porque
    -- una restricción EXCLUDE no puede consultar otra tabla.
    exclusiva       BOOLEAN         NOT NULL DEFAULT TRUE,
    creada_en       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    cancelada_en    TIMESTAMPTZ,
    actualizado_en  TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT ck_reserva_periodo CHECK (NOT isempty(periodo) AND NOT lower_inf(periodo) AND NOT upper_inf(periodo)),
    CONSTRAINT ck_reserva_monto   CHECK (monto >= 0),
    CONSTRAINT ck_reserva_cancelacion CHECK ((estado = 'CANCELADA') = (cancelada_en IS NOT NULL)),
    -- La BD garantiza que nunca existan dos reservas activas solapadas en la
    -- misma instalación exclusiva, aunque dos socios reserven al mismo milisegundo.
    CONSTRAINT ex_reserva_sin_solapamiento EXCLUDE USING gist (
        instalacion_id WITH =,
        periodo        WITH &&
    ) WHERE (exclusiva AND estado IN ('PENDIENTE', 'CONFIRMADA', 'COMPLETADA'))
);
CREATE INDEX ix_reserva_socio   ON reserva (socio_id, lower(periodo) DESC);
CREATE INDEX ix_reserva_periodo ON reserva USING gist (instalacion_id, periodo);

-- =============================================================================
-- D. PAGOS Y MOROSIDAD
-- =============================================================================

-- La CUOTA es lo que se debe (obligación). Siempre se carga al TITULAR.
CREATE TABLE cuota (
    id                 UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id           UUID            NOT NULL REFERENCES socio(id) ON DELETE RESTRICT,
    concepto           concepto_cuota  NOT NULL,
    periodo            DATE            NOT NULL,          -- primer día del mes al que corresponde
    descripcion        VARCHAR(120)    NOT NULL,
    monto              NUMERIC(10,2)   NOT NULL,
    fecha_emision      DATE            NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento  DATE            NOT NULL,
    reserva_id         UUID            UNIQUE REFERENCES reserva(id) ON DELETE SET NULL,
    pedido_id          UUID            UNIQUE,            -- FK se agrega tras crear 'pedido'
    anulada            BOOLEAN         NOT NULL DEFAULT FALSE,
    creado_en          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT ck_cuota_monto       CHECK (monto > 0),
    CONSTRAINT ck_cuota_periodo     CHECK (periodo = date_trunc('month', periodo)::date),
    CONSTRAINT ck_cuota_vencimiento CHECK (fecha_vencimiento >= fecha_emision)
);
-- Una sola cuota de mantenimiento por titular y mes.
CREATE UNIQUE INDEX uq_cuota_mantenimiento_mes ON cuota (socio_id, periodo)
    WHERE concepto = 'MANTENIMIENTO' AND NOT anulada;
CREATE INDEX ix_cuota_socio_venc ON cuota (socio_id, fecha_vencimiento);

-- El PAGO es el cobro. Una cuota puede pagarse en partes. Tabla de solo inserción:
-- un pago erróneo se ANULA (cambio de estado), nunca se borra.
CREATE TABLE pago (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    cuota_id        UUID          NOT NULL REFERENCES cuota(id) ON DELETE RESTRICT,
    monto           NUMERIC(10,2) NOT NULL,
    metodo          metodo_pago   NOT NULL,
    referencia      VARCHAR(60),                          -- n.º de operación / voucher
    estado          estado_pago   NOT NULL DEFAULT 'APROBADO',
    pagado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    registrado_por  UUID          REFERENCES usuario(id) ON DELETE SET NULL,  -- NULL = el socio desde la app

    CONSTRAINT ck_pago_monto CHECK (monto > 0)
);
CREATE INDEX ix_pago_cuota ON pago (cuota_id);
CREATE INDEX ix_pago_fecha ON pago (pagado_en DESC);

-- =============================================================================
-- E. COMUNICACIÓN Y SERVICIOS
-- =============================================================================

CREATE TABLE noticia (
    id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo        VARCHAR(120)       NOT NULL,
    contenido     TEXT               NOT NULL,
    categoria     categoria_noticia  NOT NULL DEFAULT 'GENERAL',
    imagen_url    TEXT,
    publicada_en  TIMESTAMPTZ        NOT NULL DEFAULT now(),
    expira_en     TIMESTAMPTZ,
    autor_id      UUID               REFERENCES usuario(id) ON DELETE SET NULL,

    CONSTRAINT ck_noticia_vigencia CHECK (expira_en IS NULL OR expira_en > publicada_en)
);
CREATE INDEX ix_noticia_publicada ON noticia (publicada_en DESC);

CREATE TABLE evento (
    id                     UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo                 VARCHAR(120)      NOT NULL,
    descripcion            TEXT              NOT NULL,
    categoria              categoria_evento  NOT NULL,
    lugar                  VARCHAR(80)       NOT NULL,
    inicia_en              TIMESTAMPTZ       NOT NULL,
    termina_en             TIMESTAMPTZ       NOT NULL,
    cupo                   INTEGER,                        -- NULL = sin límite
    costo                  NUMERIC(10,2)     NOT NULL DEFAULT 0,
    imagen_url             TEXT,
    inscripciones_abiertas BOOLEAN           NOT NULL DEFAULT TRUE,
    creado_en              TIMESTAMPTZ       NOT NULL DEFAULT now(),

    CONSTRAINT ck_evento_fechas CHECK (termina_en > inicia_en),
    CONSTRAINT ck_evento_cupo   CHECK (cupo IS NULL OR cupo > 0),
    CONSTRAINT ck_evento_costo  CHECK (costo >= 0)
);

CREATE TABLE inscripcion_evento (
    evento_id    UUID                NOT NULL REFERENCES evento(id) ON DELETE CASCADE,
    socio_id     UUID                NOT NULL REFERENCES socio(id) ON DELETE CASCADE,
    estado       estado_inscripcion  NOT NULL DEFAULT 'INSCRITO',
    disciplina   VARCHAR(40),                              -- para olimpiadas: 'Fútbol', 'Vóley'...
    inscrito_en  TIMESTAMPTZ         NOT NULL DEFAULT now(),
    PRIMARY KEY (evento_id, socio_id)
);

-- Catálogo informativo: posta médica, capilla, restaurante, administración.
CREATE TABLE servicio_club (
    id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre       VARCHAR(60)    NOT NULL UNIQUE,
    tipo         tipo_servicio  NOT NULL,
    descripcion  TEXT           NOT NULL,
    horario      VARCHAR(120)   NOT NULL,
    telefono     VARCHAR(15),
    activo       BOOLEAN        NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- F. TIENDA DE MERCHANDISING (simulada)
-- =============================================================================

CREATE TABLE producto (
    id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    sku          VARCHAR(20)    NOT NULL UNIQUE,
    nombre       VARCHAR(80)    NOT NULL,
    descripcion  TEXT,
    categoria    VARCHAR(30)    NOT NULL,
    precio       NUMERIC(10,2)  NOT NULL,
    stock        INTEGER        NOT NULL DEFAULT 0,
    imagen_url   TEXT,
    activo       BOOLEAN        NOT NULL DEFAULT TRUE,

    CONSTRAINT ck_producto_precio CHECK (precio > 0),
    CONSTRAINT ck_producto_stock  CHECK (stock >= 0)
);

CREATE TABLE pedido (
    id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id   UUID           NOT NULL REFERENCES socio(id) ON DELETE RESTRICT,
    estado     estado_pedido  NOT NULL DEFAULT 'PENDIENTE_PAGO',
    total      NUMERIC(10,2)  NOT NULL DEFAULT 0,
    creado_en  TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT ck_pedido_total CHECK (total >= 0)
);
CREATE INDEX ix_pedido_socio ON pedido (socio_id, creado_en DESC);

CREATE TABLE detalle_pedido (
    pedido_id        UUID           NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
    producto_id      UUID           NOT NULL REFERENCES producto(id),
    cantidad         INTEGER        NOT NULL,
    precio_unitario  NUMERIC(10,2)  NOT NULL,             -- precio congelado al comprar
    PRIMARY KEY (pedido_id, producto_id),

    CONSTRAINT ck_detalle_cantidad CHECK (cantidad > 0),
    CONSTRAINT ck_detalle_precio   CHECK (precio_unitario > 0)
);

-- Ahora que existe 'pedido', se completa la FK pendiente de 'cuota'.
ALTER TABLE cuota
    ADD CONSTRAINT fk_cuota_pedido FOREIGN KEY (pedido_id) REFERENCES pedido(id) ON DELETE SET NULL;

-- =============================================================================
-- G. NÓMINA DE TRABAJADORES (simulada)
-- =============================================================================

CREATE TABLE planilla (
    id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo       DATE             NOT NULL UNIQUE,       -- primer día del mes
    estado        estado_planilla  NOT NULL DEFAULT 'BORRADOR',
    generada_en   TIMESTAMPTZ      NOT NULL DEFAULT now(),
    generada_por  UUID             REFERENCES usuario(id) ON DELETE SET NULL,
    cerrada_en    TIMESTAMPTZ,

    CONSTRAINT ck_planilla_periodo CHECK (periodo = date_trunc('month', periodo)::date),
    CONSTRAINT ck_planilla_cierre  CHECK ((estado = 'CERRADA') = (cerrada_en IS NOT NULL))
);

-- Una boleta por trabajador y planilla. Los importes se congelan al generarla.
CREATE TABLE boleta (
    id                 UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    planilla_id        UUID           NOT NULL REFERENCES planilla(id) ON DELETE CASCADE,
    trabajador_id      UUID           NOT NULL REFERENCES trabajador(id) ON DELETE RESTRICT,
    sueldo_base        NUMERIC(10,2)  NOT NULL,
    regimen_pension    regimen_pension NOT NULL,
    descuento_pension  NUMERIC(10,2)  NOT NULL,
    monto_neto         NUMERIC(10,2)  NOT NULL,
    aporte_essalud     NUMERIC(10,2)  NOT NULL,           -- lo paga el empleador, no se descuenta
    dias_asistidos     INTEGER        NOT NULL DEFAULT 0, -- calculado desde log_acceso

    CONSTRAINT uq_boleta UNIQUE (planilla_id, trabajador_id),
    CONSTRAINT ck_boleta_montos CHECK (
        sueldo_base > 0 AND descuento_pension >= 0 AND aporte_essalud >= 0
        AND monto_neto = sueldo_base - descuento_pension
    )
);

-- =============================================================================
-- Valores por defecto de los parámetros de negocio
-- (las vistas y funciones los necesitan aunque no se cargue la semilla de demo)
-- =============================================================================
INSERT INTO parametro (clave, valor, descripcion) VALUES
  ('cuota_mantenimiento_monto', '180.00', 'Cuota mensual de mantenimiento por lote (S/)'),
  ('morosidad_dias_gracia',     '30',     'Días tras el vencimiento antes de considerar MOROSO (VENCIDO) a un titular'),
  ('morosidad_bloquea_reserva', 'true',   'Un titular VENCIDO no puede reservar. Nunca afecta el ingreso a su vivienda'),
  ('qr_vigencia_segundos',      '300',    'Vigencia del QR dinámico de acceso (RF01: 5 minutos)'),
  ('reserva_antelacion_dias',   '14',     'Días máximos de anticipación para reservar'),
  ('reserva_max_activas',       '3',      'Reservas activas simultáneas permitidas por socio'),
  ('invitados_max_mes',         '8',      'Invitados por titular y mes'),
  ('nomina_tasa_onp',           '0.13',   'Aporte ONP (simulado, referencial)'),
  ('nomina_tasa_afp',           '0.1137', 'Aporte AFP: fondo + prima + comisión (simulado, referencial)'),
  ('nomina_tasa_essalud',       '0.09',   'EsSalud a cargo del empleador (simulado, referencial)');
