-- =============================================================================
-- 05_semilla.sql
-- Datos de demostración FICTICIOS para el Club Residencial Los Girasoles.
--
-- * ~1500 socios (≈820 titulares + dependientes), 25 trabajadores.
-- * 12 meses de cuotas y pagos con tres perfiles de comportamiento
--   (puntual / irregular / moroso): es el insumo del modelo de riesgo de morosidad.
-- * Reservas de los últimos 90 días y las próximas 2 semanas.
-- * Log de accesos de 30 días (socios) y 90 días (personal, para la nómina).
--
-- Todas las fechas son RELATIVAS a CURRENT_DATE: el dashboard siempre muestra
-- datos "actuales" sin importar cuándo se levante el contenedor.
-- setseed() hace que los datos sean reproducibles entre ejecuciones.
--
-- Credenciales de demostración (solo entorno de desarrollo):
--   Socios .......... usuario = número de socio (ej. 00247) / Girasoles2026
--   Administrador ... admin / Admin2026!
--   Guardia ......... guardia01 / Guardia2026!
--   API key garita .. gir-dev-garita-principal-2026
-- =============================================================================

SET TIME ZONE 'America/Lima';
SELECT setseed(0.2026);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares temporales (desaparecen al terminar la sesión)
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.elegir(arr TEXT[]) RETURNS TEXT
LANGUAGE sql VOLATILE AS $$ SELECT arr[1 + floor(random() * array_length(arr, 1))::int] $$;

CREATE FUNCTION pg_temp.entre(a INT, b INT) RETURNS INT
LANGUAGE sql VOLATILE AS $$ SELECT a + floor(random() * (b - a + 1))::int $$;

-- Marca de tiempo en hora de Lima a partir de una fecha y minutos desde medianoche.
CREATE FUNCTION pg_temp.ts(d DATE, minutos INT) RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE AS $$
    SELECT (d + make_interval(mins => minutos))::timestamp AT TIME ZONE 'America/Lima'
$$;

CREATE FUNCTION pg_temp.sin_tildes(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT translate(lower(t), 'áéíóúñü ', 'aeiounu') $$;

-- (Los parámetros de negocio se cargan en 02_esquema.sql: son configuración, no datos de demo.)

-- -----------------------------------------------------------------------------
-- 2. Generación principal
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    -- Catálogos de nombres peruanos
    c_nom_m TEXT[] := ARRAY['José','Luis','Carlos','Jorge','Juan','Miguel','Pedro','Ricardo','Fernando','Alberto',
                            'Víctor','Raúl','César','Manuel','Óscar','Javier','Daniel','Diego','Andrés','Sergio',
                            'Eduardo','Hugo','Walter','Julio','Martín','Renato','Gustavo','Enrique'];
    c_nom_f TEXT[] := ARRAY['María','Rosa','Carmen','Ana','Patricia','Lucía','Elena','Gabriela','Sofía','Claudia',
                            'Mónica','Teresa','Silvia','Pilar','Jessica','Milagros','Diana','Valeria','Fiorella','Karina',
                            'Liliana','Gladys','Norma','Verónica','Susana','Cecilia','Natalia','Rocío'];
    c_ape   TEXT[] := ARRAY['Quispe','García','Rodríguez','Flores','Sánchez','Rojas','Torres','Mendoza','Ramírez','Vargas',
                            'Huamán','Chávez','Castillo','Díaz','Ruiz','Gutiérrez','Silva','Morales','Vega','Ríos',
                            'Luna','Pérez','Soto','Romero','Paredes','Alvarado','Espinoza','Cárdenas','Salazar','Medina',
                            'Herrera','Aguilar','Mamani','Condori','Palomino','Valdivia','Zevallos','Cornejo','Ugarte','Tello'];
    c_afp   TEXT[] := ARRAY['Integra','Prima','Profuturo','Habitat'];

    n_titulares    CONSTANT INT := 820;
    n_total_socios CONSTANT INT := 1500;

    v_hoy        DATE := CURRENT_DATE;
    v_hash_socio TEXT := crypt('Girasoles2026', gen_salt('bf', 10));
    v_admin_id   UUID;
    v_usuario_id UUID;
    v_socio_id   UUID;
    v_id         UUID;
    v_titular    RECORD;
    v_n          INT;
    v_k          INT;
    v_deps       INT;
    v_es_mujer   BOOLEAN;
    v_nombre     TEXT;
    v_ape1       TEXT;
    v_ape2       TEXT;
    v_contador_dep INT := 0;
    v_fecha_nac  DATE;
BEGIN
    -- ---------------------------------------------------------------- usuarios del personal con login
    INSERT INTO usuario (login, password_hash, rol)
    VALUES ('admin', crypt('Admin2026!', gen_salt('bf', 10)), 'ADMIN')
    RETURNING id INTO v_admin_id;

    -- ---------------------------------------------------------------- socios titulares
    FOR v_n IN 1..n_titulares LOOP
        v_es_mujer := random() < 0.42;
        v_nombre := pg_temp.elegir(CASE WHEN v_es_mujer THEN c_nom_f ELSE c_nom_m END);
        IF random() < 0.35 THEN   -- nombres compuestos, frecuentes en Perú
            v_nombre := v_nombre || ' ' || pg_temp.elegir(CASE WHEN v_es_mujer THEN c_nom_f ELSE c_nom_m END);
        END IF;
        v_ape1 := pg_temp.elegir(c_ape);
        v_ape2 := pg_temp.elegir(c_ape);

        INSERT INTO socio (numero_socio, tipo, dni, nombres, apellidos, lote, email, telefono,
                           fecha_nacimiento, estado, fecha_afiliacion)
        VALUES (
            lpad(v_n::text, 5, '0'),
            'TITULAR',
            (10000000 + v_n * 7919)::text,
            v_nombre,
            v_ape1 || ' ' || v_ape2,
            chr(65 + (v_n - 1) / 50) || '-' || lpad((((v_n - 1) % 50) + 1)::text, 2, '0'),
            pg_temp.sin_tildes(split_part(v_nombre, ' ', 1) || '.' || v_ape1) || v_n || '@correo.test',
            '9' || lpad(pg_temp.entre(10000000, 99999999)::text, 8, '0'),
            v_hoy - make_interval(years => pg_temp.entre(32, 78), days => pg_temp.entre(0, 364)),
            CASE WHEN random() < 0.02 THEN 'SUSPENDIDO' ELSE 'ACTIVO' END::estado_socio,
            -- 5 % de afiliaciones recientes (último año); el resto, antiguas
            CASE WHEN random() < 0.05
                 THEN v_hoy - pg_temp.entre(30, 330)
                 ELSE make_date(pg_temp.entre(1995, 2024), pg_temp.entre(1, 12), pg_temp.entre(1, 28))
            END
        );
    END LOOP;

    -- Socios que aparecen en los prototipos de Figma (para que la demo coincida)
    UPDATE socio SET nombres = 'María',       apellidos = 'García López',  estado = 'ACTIVO' WHERE numero_socio = '00001';
    UPDATE socio SET nombres = 'José Miguel', apellidos = 'Quispe Soto',   estado = 'ACTIVO',
                     email = 'josemiguel.quispe@correo.test', fecha_afiliacion = '2012-03-15' WHERE numero_socio = '00247';
    UPDATE socio SET nombres = 'Roberto',     apellidos = 'Silva Castro',  estado = 'ACTIVO',
                     fecha_afiliacion = '2008-06-01' WHERE numero_socio = '00289';
    UPDATE socio SET nombres = 'Carlos',      apellidos = 'Mendoza Ríos',  estado = 'ACTIVO',
                     fecha_afiliacion = '2015-01-10' WHERE numero_socio = '00448';
    UPDATE socio SET nombres = 'Ana',         apellidos = 'Torres Vega',   estado = 'ACTIVO' WHERE numero_socio = '00612';
    UPDATE socio SET nombres = 'Patricia',    apellidos = 'Luna Morales',  estado = 'ACTIVO' WHERE numero_socio = '00734';
    UPDATE socio SET nombres = 'Luis',        apellidos = 'Huamán Pérez',  estado = 'ACTIVO' WHERE numero_socio = '00786';

    -- ---------------------------------------------------------------- dependientes
    FOR v_titular IN SELECT id, numero_socio, apellidos FROM socio WHERE tipo = 'TITULAR' ORDER BY numero_socio LOOP
        EXIT WHEN v_contador_dep >= n_total_socios - n_titulares;
        v_deps := CASE WHEN random() < 0.35 THEN 0
                       WHEN random() < 0.55 THEN 1
                       WHEN random() < 0.80 THEN 2
                       ELSE 3 END;
        FOR v_k IN 1..v_deps LOOP
            EXIT WHEN v_contador_dep >= n_total_socios - n_titulares;
            v_contador_dep := v_contador_dep + 1;
            v_es_mujer := random() < 0.5;
            v_nombre := pg_temp.elegir(CASE WHEN v_es_mujer THEN c_nom_f ELSE c_nom_m END);

            IF v_k = 1 AND random() < 0.6 THEN
                -- Cónyuge: apellidos propios
                v_ape1 := pg_temp.elegir(c_ape) || ' ' || pg_temp.elegir(c_ape);
                v_fecha_nac := v_hoy - make_interval(years => pg_temp.entre(30, 75), days => pg_temp.entre(0, 364));
                INSERT INTO socio (numero_socio, tipo, titular_id, parentesco, dni, nombres, apellidos,
                                   fecha_nacimiento, fecha_afiliacion)
                VALUES (v_titular.numero_socio || '-' || lpad(v_k::text, 2, '0'), 'DEPENDIENTE', v_titular.id,
                        'CONYUGE', (50000000 + v_contador_dep * 3571)::text, v_nombre, v_ape1,
                        v_fecha_nac, v_hoy - pg_temp.entre(60, 4000));
            ELSE
                -- Hijo/a: hereda el primer apellido del titular
                v_ape1 := split_part(v_titular.apellidos, ' ', 1) || ' ' || pg_temp.elegir(c_ape);
                v_fecha_nac := v_hoy - make_interval(years => pg_temp.entre(4, 30), days => pg_temp.entre(0, 364));
                INSERT INTO socio (numero_socio, tipo, titular_id, parentesco, dni, nombres, apellidos,
                                   fecha_nacimiento, fecha_afiliacion)
                VALUES (v_titular.numero_socio || '-' || lpad(v_k::text, 2, '0'), 'DEPENDIENTE', v_titular.id,
                        'HIJO', (50000000 + v_contador_dep * 3571)::text, v_nombre, v_ape1,
                        v_fecha_nac, v_hoy - pg_temp.entre(60, 4000));
            END IF;
        END LOOP;
    END LOOP;

    -- Segunda pasada si faltó llegar al total: un dependiente más a titulares sin familiares
    FOR v_titular IN SELECT s.id, s.numero_socio, s.apellidos FROM socio s
                     WHERE s.tipo = 'TITULAR'
                       AND NOT EXISTS (SELECT 1 FROM socio d WHERE d.titular_id = s.id)
                     ORDER BY s.numero_socio DESC LOOP
        EXIT WHEN v_contador_dep >= n_total_socios - n_titulares;
        v_contador_dep := v_contador_dep + 1;
        INSERT INTO socio (numero_socio, tipo, titular_id, parentesco, dni, nombres, apellidos,
                           fecha_nacimiento, fecha_afiliacion)
        VALUES (v_titular.numero_socio || '-01', 'DEPENDIENTE', v_titular.id, 'HIJO',
                (50000000 + v_contador_dep * 3571)::text, pg_temp.elegir(c_nom_f),
                split_part(v_titular.apellidos, ' ', 1) || ' ' || pg_temp.elegir(c_ape),
                v_hoy - make_interval(years => pg_temp.entre(4, 30)), v_hoy - pg_temp.entre(60, 4000));
    END LOOP;

    -- ---------------------------------------------------------------- cuentas de usuario de socios
    -- Titulares y dependientes mayores de 16 años inician sesión con su número de socio.
    -- Se reutiliza un único hash para que la semilla no tarde minutos.
    FOR v_socio_id, v_nombre IN
        SELECT id, numero_socio FROM socio
        WHERE tipo = 'TITULAR' OR fecha_nacimiento <= v_hoy - INTERVAL '16 years'
    LOOP
        INSERT INTO usuario (login, password_hash, rol) VALUES (v_nombre, v_hash_socio, 'SOCIO')
        RETURNING id INTO v_usuario_id;
        UPDATE socio SET usuario_id = v_usuario_id WHERE id = v_socio_id;
    END LOOP;

    -- ---------------------------------------------------------------- trabajadores
    DECLARE
        c_cargos  cargo_trabajador[] := ARRAY[
            'ADMINISTRATIVO','ADMINISTRATIVO','ADMINISTRATIVO',
            'GUARDIA','GUARDIA','GUARDIA','GUARDIA','GUARDIA','GUARDIA',
            'LIMPIEZA','LIMPIEZA','LIMPIEZA','LIMPIEZA','LIMPIEZA','LIMPIEZA','LIMPIEZA','LIMPIEZA',
            'MANTENIMIENTO','MANTENIMIENTO','MANTENIMIENTO','MANTENIMIENTO',
            'JARDINERIA','JARDINERIA','JARDINERIA','JARDINERIA']::cargo_trabajador[];
        v_cargo    cargo_trabajador;
        v_regimen  regimen_pension;
        v_sueldo   NUMERIC;
        v_n_guard  INT := 0;
        v_n_adm    INT := 0;
        v_login    TEXT;
    BEGIN
        FOR v_n IN 1..array_length(c_cargos, 1) LOOP
            v_cargo := c_cargos[v_n];
            v_es_mujer := random() < (CASE v_cargo WHEN 'LIMPIEZA' THEN 0.7 WHEN 'ADMINISTRATIVO' THEN 0.5 ELSE 0.1 END);
            v_regimen := CASE WHEN random() < 0.4 THEN 'ONP' ELSE 'AFP' END::regimen_pension;
            v_sueldo := CASE v_cargo
                            WHEN 'ADMINISTRATIVO' THEN 2500
                            WHEN 'GUARDIA'        THEN 1500
                            WHEN 'MANTENIMIENTO'  THEN 1600
                            WHEN 'JARDINERIA'     THEN 1250
                            ELSE 1200 END + pg_temp.entre(0, 4) * 50;

            v_usuario_id := NULL;
            IF v_cargo = 'GUARDIA' THEN
                v_n_guard := v_n_guard + 1;
                v_login := 'guardia' || lpad(v_n_guard::text, 2, '0');
                INSERT INTO usuario (login, password_hash, rol)
                VALUES (v_login, crypt('Guardia2026!', gen_salt('bf', 10)), 'GUARDIA')
                RETURNING id INTO v_usuario_id;
            ELSIF v_cargo = 'ADMINISTRATIVO' THEN
                v_n_adm := v_n_adm + 1;
                IF v_n_adm = 1 THEN
                    v_usuario_id := v_admin_id;   -- el administrador principal es un trabajador más
                ELSE
                    v_login := 'admin' || lpad(v_n_adm::text, 2, '0');
                    INSERT INTO usuario (login, password_hash, rol)
                    VALUES (v_login, crypt('Admin2026!', gen_salt('bf', 10)), 'ADMIN')
                    RETURNING id INTO v_usuario_id;
                END IF;
            END IF;

            INSERT INTO trabajador (usuario_id, dni, nombres, apellidos, cargo, sueldo_base,
                                    regimen_pension, afp_nombre, telefono, fecha_ingreso)
            VALUES (v_usuario_id,
                    (70000000 + v_n * 1013)::text,
                    pg_temp.elegir(CASE WHEN v_es_mujer THEN c_nom_f ELSE c_nom_m END),
                    pg_temp.elegir(c_ape) || ' ' || pg_temp.elegir(c_ape),
                    v_cargo, v_sueldo, v_regimen,
                    CASE WHEN v_regimen = 'AFP' THEN pg_temp.elegir(c_afp) END,
                    '9' || lpad(pg_temp.entre(10000000, 99999999)::text, 8, '0'),
                    CASE WHEN v_n IN (12, 23) THEN v_hoy - pg_temp.entre(20, 80)   -- dos ingresos recientes
                         ELSE make_date(pg_temp.entre(2012, 2025), pg_temp.entre(1, 12), pg_temp.entre(1, 28)) END);
        END LOOP;
    END;
END
$$;

-- -----------------------------------------------------------------------------
-- 3. Garitas (puntos de acceso IoT) y credenciales RFID
-- -----------------------------------------------------------------------------
INSERT INTO punto_acceso (codigo, nombre, tipo, api_key_hash) VALUES
  ('GARITA-PRINCIPAL', 'Garita principal - ingreso vehicular', 'VEHICULAR',
   encode(digest('gir-dev-garita-principal-2026', 'sha256'), 'hex')),
  ('GARITA-PEATONAL',  'Garita peatonal - puerta lateral',     'PEATONAL',
   encode(digest('gir-dev-garita-peatonal-2026', 'sha256'), 'hex'));

-- Una tarjeta activa por persona. UID derivado del id (determinista y único en la práctica).
INSERT INTO credencial_rfid (uid_tarjeta, socio_id, emitida_en)
SELECT upper(substr(md5('socio-' || id::text), 1, 8)), id, fecha_afiliacion::timestamptz
FROM socio
WHERE numero_socio <> '00247';

INSERT INTO credencial_rfid (uid_tarjeta, trabajador_id, emitida_en)
SELECT upper(substr(md5('trab-' || id::text), 1, 8)), id, fecha_ingreso::timestamptz
FROM trabajador;

-- Tarjetas fijas que usa el simulador Wokwi (deben coincidir con iot/garita-esp32/include/config.h)
--   A1B2C3D4 -> socio 00247, tarjeta activa
--   DEADBEEF -> socio 00247, tarjeta antigua reportada como PERDIDA (acceso denegado)
--   C0FFEE01 -> trabajador de limpieza, tarjeta activa
INSERT INTO credencial_rfid (uid_tarjeta, socio_id, estado, emitida_en, revocada_en)
SELECT 'A1B2C3D4', id, 'ACTIVA'::estado_credencial, now() - INTERVAL '40 days', NULL::timestamptz
FROM socio WHERE numero_socio = '00247'
UNION ALL
SELECT 'DEADBEEF', id, 'PERDIDA'::estado_credencial, '2019-05-02'::timestamptz, now() - INTERVAL '41 days'
FROM socio WHERE numero_socio = '00247';

UPDATE credencial_rfid SET uid_tarjeta = 'C0FFEE01'
WHERE trabajador_id = (SELECT id FROM trabajador WHERE cargo = 'LIMPIEZA' ORDER BY dni LIMIT 1);

-- -----------------------------------------------------------------------------
-- 4. Instalaciones, bloqueos y servicios
-- -----------------------------------------------------------------------------
INSERT INTO instalacion (codigo, nombre, tipo, descripcion, capacidad, exclusiva, tarifa_hora,
                         hora_apertura, hora_cierre, duracion_bloque_min) VALUES
  ('FUTBOL-1',  'Cancha de Fútbol 1',        'FUTBOL',  'Grass natural, fútbol 11',            22, TRUE,  30, '07:00', '19:00', 60),
  ('FUTBOL-2',  'Cancha de Fútbol 2',        'FUTBOL',  'Grass sintético, fútbol 7',           14, TRUE,  40, '07:00', '22:00', 60),
  ('BASQUET-1', 'Cancha de Básquet',         'BASQUET', 'Losa multiuso techada',               10, TRUE,  20, '07:00', '21:00', 60),
  ('VOLEY-1',   'Cancha de Vóley',           'VOLEY',   'Losa con malla reglamentaria',        12, TRUE,  15, '07:00', '21:00', 60),
  ('FRONTON-1', 'Frontón',                   'FRONTON', 'Frontón de paleta',                    4, TRUE,  10, '07:00', '19:00', 60),
  ('TENIS-1',   'Cancha de Tenis 1',         'TENIS',   'Arcilla',                              4, TRUE,  20, '07:00', '19:00', 60),
  ('TENIS-2',   'Cancha de Tenis 2',         'TENIS',   'Cemento',                              4, TRUE,  20, '07:00', '19:00', 60),
  ('PISCINA-1', 'Piscina',                   'PISCINA', 'Piscina semiolímpica, aforo controlado', 60, FALSE, 0, '08:00', '18:00', 60),
  ('CABANA-1',  'Cabaña con parrilla 1',     'CABANA',  'Para 20 personas, parrilla y mesas',  20, TRUE,  10, '09:00', '20:00', 480),
  ('CABANA-2',  'Cabaña con parrilla 2',     'CABANA',  'Para 20 personas, parrilla y mesas',  20, TRUE,  10, '09:00', '20:00', 480),
  ('CABANA-3',  'Cabaña con parrilla 3',     'CABANA',  'Para 30 personas, horno de barro',    30, TRUE,  15, '09:00', '20:00', 480),
  ('CABANA-4',  'Cabaña con parrilla 4',     'CABANA',  'Para 12 personas',                    12, TRUE,   8, '09:00', '20:00', 480),
  ('CAPILLA-1', 'Capilla del Club',          'CAPILLA', 'Misas, bautizos y matrimonios',       80, TRUE,   0, '08:00', '18:00', 120),
  ('POSTA-1',   'Posta Médica - consulta',   'POSTA',   'Atención primaria, citas de 30 min',   1, TRUE,   0, '08:00', '16:00', 30);

-- Mantenimiento de piscina dentro de dos semanas y uno pasado en Fútbol 2
INSERT INTO bloqueo_instalacion (instalacion_id, periodo, motivo, creado_por)
SELECT id,
       tstzrange(pg_temp.ts(CURRENT_DATE + 16, 0), pg_temp.ts(CURRENT_DATE + 19, 0), '[)'),
       'Mantenimiento anual de piscina',
       (SELECT id FROM usuario WHERE login = 'admin')
FROM instalacion WHERE codigo = 'PISCINA-1'
UNION ALL
SELECT id,
       tstzrange(pg_temp.ts(CURRENT_DATE - 20, 0), pg_temp.ts(CURRENT_DATE - 17, 0), '[)'),
       'Resembrado de grass',
       (SELECT id FROM usuario WHERE login = 'admin')
FROM instalacion WHERE codigo = 'FUTBOL-2';

INSERT INTO servicio_club (nombre, tipo, descripcion, horario, telefono) VALUES
  ('Posta Médica',      'POSTA',          'Atención primaria, primeros auxilios y tópico. Citas desde la app.', 'Lun-Sáb 08:00-16:00 | Emergencias 24 h', '014560101'),
  ('Capilla del Club',  'CAPILLA',        'Misa dominical 10:00. Bautizos y matrimonios previa reserva.',       'Dom 09:00-13:00 | Otros días con cita',  '014560102'),
  ('Restaurante El Girasol', 'RESTAURANTE','Menú del día, carta criolla y parrillas los fines de semana.',       'Mar-Dom 12:00-21:00',                    '014560103'),
  ('Administración',    'ADMINISTRACION', 'Pagos presenciales, emisión de carnés y atención al socio.',         'Lun-Vie 08:30-17:30 | Sáb 09:00-13:00',  '014560100');

-- -----------------------------------------------------------------------------
-- 5. Noticias y eventos
-- -----------------------------------------------------------------------------
INSERT INTO noticia (titulo, contenido, categoria, publicada_en, expira_en, autor_id)
SELECT t.titulo, t.contenido, t.categoria::categoria_noticia, now() - t.hace, t.expira, u.id
FROM (VALUES
  ('Mantenimiento de piscina',
   'La piscina permanecerá cerrada por mantenimiento anual del ' || to_char(CURRENT_DATE + 16, 'DD/MM') ||
   ' al ' || to_char(CURRENT_DATE + 18, 'DD/MM') || '. Agradecemos su comprensión.',
   'IMPORTANTE', INTERVAL '1 day', now() + INTERVAL '19 days'),
  ('Inscripciones abiertas: Olimpiadas Los Girasoles 2026',
   'Inscríbete desde la app en fútbol, vóley, básquet, tenis, frontón y natación. Cupos limitados.',
   'EVENTO', INTERVAL '3 days', NULL::timestamptz),
  ('Corte programado de agua',
   'Sedapal realizará trabajos en la red. El jueves no habrá agua en los lotes de los bloques A a D de 09:00 a 14:00.',
   'MANTENIMIENTO', INTERVAL '5 days', now() + INTERVAL '3 days'),
  ('Campaña de vacunación en la Posta',
   'Vacuna contra la influenza gratuita para socios mayores de 60 años y niños. Traer DNI y carné.',
   'GENERAL', INTERVAL '8 days', now() + INTERVAL '20 days'),
  ('Nuevo horario del restaurante',
   'Desde este mes, El Girasol atiende de martes a domingo de 12:00 a 21:00.',
   'GENERAL', INTERVAL '15 days', NULL::timestamptz),
  ('Ahora puedes pagar tu cuota con Yape y Plin',
   'Paga tu cuota de mantenimiento desde la app con tarjeta, Yape o Plin y descarga tu comprobante.',
   'IMPORTANTE', INTERVAL '25 days', NULL::timestamptz)
) AS t(titulo, contenido, categoria, hace, expira)
CROSS JOIN (SELECT id FROM usuario WHERE login = 'admin') u;

INSERT INTO evento (titulo, descripcion, categoria, lugar, inicia_en, termina_en, cupo, costo, inscripciones_abiertas)
VALUES
  ('Olimpiadas Los Girasoles 2026',
   'La gran fiesta deportiva anual del club. Competencias por bloques en fútbol, vóley, básquet, tenis, frontón y natación.',
   'DEPORTE', 'Complejo deportivo', pg_temp.ts(CURRENT_DATE + 18, 8 * 60), pg_temp.ts(CURRENT_DATE + 20, 18 * 60), 400, 0, TRUE),
  ('Campeonato Interno de Tenis',
   'Torneo de singles por categorías. Premiación en la cena de fin de año.',
   'DEPORTE', 'Canchas de tenis', pg_temp.ts(CURRENT_DATE + 9, 9 * 60), pg_temp.ts(CURRENT_DATE + 10, 17 * 60), 32, 20, TRUE),
  ('Misa de aniversario del Club',
   'Celebración eucarística por el aniversario del Club Residencial Los Girasoles.',
   'RELIGIOSO', 'Capilla del Club', pg_temp.ts(CURRENT_DATE + 12, 10 * 60), pg_temp.ts(CURRENT_DATE + 12, 11 * 60 + 30), NULL, 0, FALSE),
  ('Noche de Navidad Familiar',
   'Chocolatada, show infantil y visita de Papá Noel para los hijos de los socios.',
   'FESTIVAL', 'Explanada central', pg_temp.ts(make_date(extract(year FROM CURRENT_DATE)::int, 12, 20), 18 * 60),
   pg_temp.ts(make_date(extract(year FROM CURRENT_DATE)::int, 12, 20), 22 * 60), 600, 0, TRUE),
  ('Fiesta de Año Nuevo',
   'Cena, orquesta y fuegos artificiales. Entrada por persona.',
   'SOCIAL', 'Salón principal', pg_temp.ts(make_date(extract(year FROM CURRENT_DATE)::int, 12, 31), 21 * 60),
   pg_temp.ts(make_date(extract(year FROM CURRENT_DATE)::int + 1, 1, 1), 4 * 60), 350, 120, TRUE),
  ('Halloween Familiar',
   'Concurso de disfraces y recorrido de dulces por los bloques.',
   'SOCIAL', 'Explanada central', pg_temp.ts(CURRENT_DATE - 7, 16 * 60), pg_temp.ts(CURRENT_DATE - 7, 20 * 60), NULL, 0, FALSE);

-- ~180 inscritos en las olimpiadas, cada uno en una disciplina
INSERT INTO inscripcion_evento (evento_id, socio_id, disciplina, inscrito_en)
SELECT e.id, s.id,
       (ARRAY['Fútbol','Vóley','Básquet','Tenis','Frontón','Natación'])[1 + floor(random() * 6)::int],
       now() - (random() * INTERVAL '3 days')
FROM evento e
CROSS JOIN LATERAL (SELECT id FROM socio WHERE estado = 'ACTIVO' ORDER BY random() LIMIT 180) s
WHERE e.titulo LIKE 'Olimpiadas%';

INSERT INTO inscripcion_evento (evento_id, socio_id, disciplina, inscrito_en)
SELECT e.id, s.id, 'Singles', now() - (random() * INTERVAL '5 days')
FROM evento e
CROSS JOIN LATERAL (SELECT id FROM socio WHERE estado = 'ACTIVO' ORDER BY random() LIMIT 21) s
WHERE e.titulo LIKE 'Campeonato Interno%';

-- -----------------------------------------------------------------------------
-- 6. Tienda (simulada)
-- -----------------------------------------------------------------------------
INSERT INTO producto (sku, nombre, descripcion, categoria, precio, stock) VALUES
  ('POL-OFI-01', 'Polo oficial del Club',     'Algodón pima, logo bordado',            'Ropa',       45.00, 120),
  ('CAS-DEP-01', 'Casaca deportiva',          'Cortavientos impermeable',              'Ropa',       95.00,  40),
  ('SHO-DEP-01', 'Short deportivo',           'Dry-fit, colores del club',             'Ropa',       35.00,  80),
  ('GOR-OFI-01', 'Gorra Los Girasoles',       'Ajustable, protección UV',              'Accesorios', 25.00, 150),
  ('TOA-PIS-01', 'Toalla de piscina',         'Microfibra 70x140 cm',                  'Accesorios', 35.00,  60),
  ('TOM-ACE-01', 'Tomatodo de acero',         '750 ml, mantiene frío 24 h',            'Accesorios', 20.00, 200),
  ('LLA-OFI-01', 'Llavero institucional',     'Metálico con esmalte',                  'Souvenirs',   8.00, 300),
  ('TAZ-OFI-01', 'Taza aniversario',          'Cerámica 350 ml',                       'Souvenirs',  18.00,  90);

-- -----------------------------------------------------------------------------
-- 7. Cuotas, pagos, pedidos y reservas
-- -----------------------------------------------------------------------------
-- Perfil de pago de cada titular. Es la "verdad oculta" que el modelo de
-- riesgo de morosidad intentará descubrir solo a partir del historial.
CREATE TEMP TABLE perfil_pago AS
SELECT id AS socio_id,
       CASE numero_socio
            WHEN '00247' THEN 'PUNTUAL'
            WHEN '00001' THEN 'PUNTUAL'
            WHEN '00289' THEN 'MOROSO'
            WHEN '00448' THEN 'IRREGULAR'
            ELSE CASE WHEN r < 0.75 THEN 'PUNTUAL'
                      WHEN r < 0.92 THEN 'IRREGULAR'
                      ELSE 'MOROSO' END
       END AS perfil,
       CASE numero_socio WHEN '00289' THEN 4      -- moroso de demo: 4 meses impagos
            ELSE pg_temp.entre(1, 6) END AS meses_sin_pagar   -- solo aplica a morosos
FROM (SELECT id, numero_socio, random() AS r FROM socio WHERE tipo = 'TITULAR') t;

DO $$
DECLARE
    v_hoy        DATE := CURRENT_DATE;
    v_mes_actual DATE := date_trunc('month', CURRENT_DATE)::date;
    v_monto      NUMERIC := fn_parametro_num('cuota_mantenimiento_monto');
    v_admin      UUID := (SELECT id FROM usuario WHERE login = 'admin');
    v_tit        RECORD;
    v_i          INT;
    v_mes        DATE;
    v_venc       DATE;
    v_cuota_id   UUID;
    v_fecha_pago DATE;
    v_metodo     metodo_pago;
    v_r          FLOAT;
    v_parcial    BOOLEAN;
BEGIN
    FOR v_tit IN
        SELECT s.id, s.fecha_afiliacion, p.perfil, p.meses_sin_pagar
        FROM socio s JOIN perfil_pago p ON p.socio_id = s.id
    LOOP
        FOR v_i IN REVERSE 12..0 LOOP
            v_mes  := (v_mes_actual - make_interval(months => v_i))::date;
            v_venc := (v_mes + INTERVAL '1 month - 1 day')::date;
            CONTINUE WHEN v_tit.fecha_afiliacion > v_venc;

            INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_emision, fecha_vencimiento)
            VALUES (v_tit.id, 'MANTENIMIENTO', v_mes,
                    'Cuota de mantenimiento ' || to_char(v_mes, 'MM/YYYY'), v_monto, v_mes, v_venc)
            RETURNING id INTO v_cuota_id;

            -- ¿Cuándo paga este socio esta cuota? (NULL = no la paga)
            v_r := random();
            v_parcial := FALSE;
            v_fecha_pago := CASE
                WHEN v_tit.perfil = 'PUNTUAL' THEN
                    v_mes + pg_temp.entre(0, 19)
                WHEN v_tit.perfil = 'MOROSO' AND v_i < v_tit.meses_sin_pagar THEN
                    NULL
                WHEN v_r < 0.70 THEN                     -- irregular / moroso antes de dejar de pagar
                    v_mes + pg_temp.entre(8, 27)
                WHEN v_r < 0.95 THEN                     -- paga después del vencimiento
                    v_venc + pg_temp.entre(5, 45)
                ELSE NULL                                -- se le olvidó: queda vencida
            END;
            v_parcial := v_tit.perfil <> 'PUNTUAL' AND random() < 0.12;

            CONTINUE WHEN v_fecha_pago IS NULL OR v_fecha_pago > v_hoy;

            v_r := random();
            v_metodo := CASE WHEN v_r < 0.35 THEN 'EFECTIVO'
                             WHEN v_r < 0.65 THEN 'YAPE_PLIN'
                             WHEN v_r < 0.85 THEN 'TARJETA'
                             ELSE 'TRANSFERENCIA' END;

            IF v_parcial THEN
                -- Pago en dos partes: la mitad a la fecha y el resto ~10 días después (si ya ocurrió)
                INSERT INTO pago (cuota_id, monto, metodo, referencia, pagado_en, registrado_por)
                VALUES (v_cuota_id, v_monto / 2, v_metodo, 'OP-' || pg_temp.entre(100000, 999999),
                        pg_temp.ts(v_fecha_pago, pg_temp.entre(8 * 60, 20 * 60)),
                        CASE WHEN v_metodo IN ('EFECTIVO', 'TRANSFERENCIA') THEN v_admin END);
                v_fecha_pago := v_fecha_pago + pg_temp.entre(7, 14);
                IF v_fecha_pago <= v_hoy THEN
                    INSERT INTO pago (cuota_id, monto, metodo, referencia, pagado_en, registrado_por)
                    VALUES (v_cuota_id, v_monto / 2, v_metodo, 'OP-' || pg_temp.entre(100000, 999999),
                            pg_temp.ts(v_fecha_pago, pg_temp.entre(8 * 60, 20 * 60)),
                            CASE WHEN v_metodo IN ('EFECTIVO', 'TRANSFERENCIA') THEN v_admin END);
                END IF;
            ELSE
                INSERT INTO pago (cuota_id, monto, metodo, referencia, pagado_en, registrado_por)
                VALUES (v_cuota_id, v_monto, v_metodo, 'OP-' || pg_temp.entre(100000, 999999),
                        pg_temp.ts(v_fecha_pago, pg_temp.entre(8 * 60, 20 * 60)),
                        CASE WHEN v_metodo IN ('EFECTIVO', 'TRANSFERENCIA') THEN v_admin END);
            END IF;
        END LOOP;
    END LOOP;
END
$$;

-- Pagos de hoy que caerían en una hora futura se mueven al pasado inmediato
UPDATE pago SET pagado_en = now() - (random() * INTERVAL '3 hours') WHERE pagado_en > now();

-- ---------------------------------------------------------------- pedidos de la tienda
DO $$
DECLARE
    v_n        INT;
    v_pedido   UUID;
    v_socio    UUID;
    v_fecha    TIMESTAMPTZ;
    v_total    NUMERIC;
    v_cuota    UUID;
BEGIN
    FOR v_n IN 1..70 LOOP
        SELECT s.id INTO v_socio
        FROM socio s JOIN perfil_pago p ON p.socio_id = s.id
        WHERE p.perfil <> 'MOROSO' ORDER BY random() LIMIT 1;

        v_fecha := now() - (random() * INTERVAL '90 days');

        INSERT INTO pedido (socio_id, estado, creado_en)
        VALUES (v_socio, CASE WHEN v_fecha < now() - INTERVAL '3 days' THEN 'ENTREGADO' ELSE 'PAGADO' END::estado_pedido, v_fecha)
        RETURNING id INTO v_pedido;

        INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario)
        SELECT v_pedido, id, pg_temp.entre(1, 2), precio
        FROM producto ORDER BY random() LIMIT pg_temp.entre(1, 3);

        SELECT total INTO v_total FROM pedido WHERE id = v_pedido;

        INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_emision,
                           fecha_vencimiento, pedido_id)
        VALUES (v_socio, 'TIENDA', date_trunc('month', v_fecha)::date,
                'Compra en tienda del club', v_total, v_fecha::date, v_fecha::date, v_pedido)
        RETURNING id INTO v_cuota;

        INSERT INTO pago (cuota_id, monto, metodo, referencia, pagado_en)
        VALUES (v_cuota, v_total,
                CASE WHEN random() < 0.6 THEN 'TARJETA' ELSE 'YAPE_PLIN' END::metodo_pago,
                'SIM-' || pg_temp.entre(100000, 999999), v_fecha);
    END LOOP;

    UPDATE producto p SET stock = greatest(p.stock - COALESCE(v.vendidos, 0), 0)
    FROM (SELECT producto_id, sum(cantidad) AS vendidos FROM detalle_pedido GROUP BY 1) v
    WHERE v.producto_id = p.id;
END
$$;

-- ---------------------------------------------------------------- reservas
DO $$
DECLARE
    v_hoy        DATE := CURRENT_DATE;
    v_dia        DATE;
    v_inst       RECORD;
    v_min        INT;          -- minutos desde medianoche
    v_fin_min    INT;
    v_prob       FLOAT;
    v_fin_semana BOOLEAN;
    v_socio      UUID;
    v_titular    UUID;
    v_inicio     TIMESTAMPTZ;
    v_fin        TIMESTAMPTZ;
    v_estado     estado_reserva;
    v_monto      NUMERIC;
    v_reserva    UUID;
    v_cuota      UUID;
    v_creada     TIMESTAMPTZ;
    v_personas   INT;
    v_socios     UUID[];
    v_titulares  UUID[];
    v_idx        INT;
BEGIN
    -- Candidatos: socios activos cuyo titular no es moroso crónico
    SELECT array_agg(s.id), array_agg(COALESCE(s.titular_id, s.id))
    INTO v_socios, v_titulares
    FROM socio s
    JOIN perfil_pago p ON p.socio_id = COALESCE(s.titular_id, s.id)
    WHERE s.estado = 'ACTIVO' AND p.perfil <> 'MOROSO';

    FOR v_dia IN SELECT generate_series(v_hoy - 90, v_hoy + 14, INTERVAL '1 day')::date LOOP
        v_fin_semana := extract(isodow FROM v_dia) >= 6;

        FOR v_inst IN SELECT * FROM instalacion WHERE activa LOOP
            v_min := extract(hour FROM v_inst.hora_apertura)::int * 60;
            WHILE v_min + v_inst.duracion_bloque_min
                  <= extract(epoch FROM v_inst.hora_cierre)::int / 60 LOOP

                v_fin_min := v_min + v_inst.duracion_bloque_min;

                -- Probabilidad de que la franja se reserve según tipo, día y hora
                v_prob := CASE v_inst.tipo
                    WHEN 'CABANA'  THEN CASE WHEN v_fin_semana THEN 0.65 ELSE 0.12 END
                    WHEN 'CAPILLA' THEN CASE WHEN v_fin_semana AND v_min BETWEEN 600 AND 840 THEN 0.30 ELSE 0.0 END
                    WHEN 'POSTA'   THEN CASE WHEN v_fin_semana THEN 0.15 ELSE 0.45 END
                    WHEN 'PISCINA' THEN 1.0
                    ELSE CASE WHEN v_fin_semana THEN 0.55 ELSE 0.18 END
                         + CASE WHEN v_min >= 17 * 60 THEN 0.25 ELSE 0 END   -- hora punta después del trabajo
                END;

                IF random() < v_prob
                   AND NOT EXISTS (SELECT 1 FROM bloqueo_instalacion b
                                   WHERE b.instalacion_id = v_inst.id
                                     AND b.periodo && tstzrange(pg_temp.ts(v_dia, v_min), pg_temp.ts(v_dia, v_fin_min), '[)')) THEN

                    v_inicio := pg_temp.ts(v_dia, v_min);
                    v_fin    := pg_temp.ts(v_dia, v_fin_min);

                    -- La piscina admite varias reservas por franja (hasta su aforo)
                    v_personas := CASE WHEN v_inst.tipo = 'PISCINA'
                                       THEN CASE WHEN v_fin_semana THEN pg_temp.entre(8, 30) ELSE pg_temp.entre(0, 9) END
                                       ELSE 1 END;

                    FOR v_k IN 1..v_personas LOOP
                        v_idx := 1 + floor(random() * array_length(v_socios, 1))::int;
                        v_socio := v_socios[v_idx];
                        v_titular := v_titulares[v_idx];
                        v_creada := v_inicio - (pg_temp.entre(1, 7) * INTERVAL '1 day') - (random() * INTERVAL '10 hours');

                        IF v_inicio < now() THEN
                            v_estado := CASE WHEN random() < 0.08 THEN 'CANCELADA' ELSE 'COMPLETADA' END;
                        ELSE
                            v_estado := CASE WHEN random() < 0.15 THEN 'PENDIENTE' ELSE 'CONFIRMADA' END;
                        END IF;

                        v_monto := v_inst.tarifa_hora * v_inst.duracion_bloque_min / 60.0;

                        INSERT INTO reserva (socio_id, instalacion_id, periodo, estado, monto, creada_en, cancelada_en)
                        VALUES (v_socio, v_inst.id, tstzrange(v_inicio, v_fin, '[)'), v_estado, v_monto,
                                LEAST(v_creada, now()),
                                CASE WHEN v_estado = 'CANCELADA' THEN LEAST(v_creada + INTERVAL '1 day', now()) END)
                        RETURNING id INTO v_reserva;

                        -- Reservas con tarifa generan su cuota; se pagan al confirmar
                        IF v_monto > 0 AND v_estado <> 'CANCELADA' THEN
                            INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_emision,
                                               fecha_vencimiento, reserva_id)
                            VALUES (v_titular, 'RESERVA', date_trunc('month', v_inicio)::date,
                                    'Reserva ' || v_inst.nombre || ' ' || to_char(v_inicio, 'DD/MM HH24:MI'),
                                    v_monto, LEAST(v_creada, now())::date, v_inicio::date, v_reserva)
                            RETURNING id INTO v_cuota;

                            IF v_estado <> 'PENDIENTE' THEN
                                INSERT INTO pago (cuota_id, monto, metodo, referencia, pagado_en)
                                VALUES (v_cuota, v_monto,
                                        CASE WHEN random() < 0.5 THEN 'YAPE_PLIN' ELSE 'TARJETA' END::metodo_pago,
                                        'APP-' || pg_temp.entre(100000, 999999), LEAST(v_creada, now()));
                            END IF;
                        END IF;
                    END LOOP;
                END IF;

                v_min := v_fin_min;
            END LOOP;
        END LOOP;
    END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- 8. Invitados y log de accesos
-- -----------------------------------------------------------------------------
INSERT INTO invitado (socio_anfitrion_id, dni, nombres, apellidos, placa_vehiculo, fecha_visita, creado_en)
SELECT DISTINCT ON (s.id, dni.v, f.d)
       s.id, dni.v,
       (ARRAY['Pedro','Lucía','Marco','Sofía','Andrés','Patricia','Diego','Carla'])[1 + floor(random() * 8)::int],
       (ARRAY['Alvarado Chávez','Fernández Torres','Herrera Palomino','Castillo Reyes','Vargas Díaz','Huanca Lima'])[1 + floor(random() * 6)::int],
       CASE WHEN random() < 0.4 THEN chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int)
                                     || chr(48 + floor(random() * 10)::int) || '-' || lpad(floor(random() * 1000)::text, 3, '0') END,
       f.d,
       (f.d - 1)::timestamptz
FROM generate_series(1, 260) g
CROSS JOIN LATERAL (SELECT id FROM socio WHERE tipo = 'TITULAR' AND estado = 'ACTIVO' AND g > 0 ORDER BY random() LIMIT 1) s
CROSS JOIN LATERAL (SELECT (80000000 + g * 4219)::text AS v) dni
CROSS JOIN LATERAL (SELECT CURRENT_DATE - pg_temp.entre(-5, 30) + (g * 0) AS d) f;

DO $$
DECLARE
    v_hoy        DATE := CURRENT_DATE;
    v_dia        DATE;
    v_fin_semana BOOLEAN;
    v_n          INT;
    v_i          INT;
    v_min        INT;
    v_cand       RECORD;
    v_ts         TIMESTAMPTZ;
    v_metodo     metodo_acceso;
    v_r          FLOAT;
    v_veh        UUID := (SELECT id FROM punto_acceso WHERE codigo = 'GARITA-PRINCIPAL');
    v_pea        UUID := (SELECT id FROM punto_acceso WHERE codigo = 'GARITA-PEATONAL');
    v_socios     UUID[];
    v_uids       TEXT[];
    v_idx        INT;
    v_t          RECORD;
    v_turno      INT;
BEGIN
    SELECT array_agg(c.socio_id), array_agg(c.uid_tarjeta)
    INTO v_socios, v_uids
    FROM credencial_rfid c JOIN socio s ON s.id = c.socio_id
    WHERE c.estado = 'ACTIVA' AND s.estado = 'ACTIVO';

    -- ---------------- Socios: últimos 30 días
    FOR v_dia IN SELECT generate_series(v_hoy - 30, v_hoy, INTERVAL '1 day')::date LOOP
        v_fin_semana := extract(isodow FROM v_dia) >= 6;
        v_n := CASE WHEN v_fin_semana THEN pg_temp.entre(380, 480) ELSE pg_temp.entre(220, 300) END;

        FOR v_i IN 1..v_n LOOP
            -- Más tráfico en la mañana (7-9 h) y la tarde-noche (17-21 h)
            v_r := random();
            v_min := CASE WHEN v_r < 0.30 THEN pg_temp.entre(6 * 60, 9 * 60)
                          WHEN v_r < 0.70 THEN pg_temp.entre(17 * 60, 21 * 60)
                          ELSE pg_temp.entre(9 * 60, 23 * 60) END;
            v_ts := pg_temp.ts(v_dia, v_min) + (random() * INTERVAL '59 seconds');
            CONTINUE WHEN v_ts > now();

            v_r := random();
            v_metodo := CASE WHEN v_r < 0.70 THEN 'RFID' WHEN v_r < 0.95 THEN 'QR' ELSE 'MANUAL' END;
            v_idx := 1 + floor(random() * array_length(v_socios, 1))::int;

            IF random() < 0.025 THEN
                -- Intento denegado: tarjeta desconocida o QR vencido
                INSERT INTO log_acceso (punto_acceso_id, socio_id, metodo, credencial_leida, direccion,
                                        resultado, motivo, latencia_ms, ocurrido_en)
                VALUES (CASE WHEN random() < 0.65 THEN v_veh ELSE v_pea END,
                        CASE WHEN v_metodo = 'QR' THEN v_socios[v_idx] END,
                        CASE WHEN v_metodo = 'MANUAL' THEN 'RFID' ELSE v_metodo END,
                        CASE WHEN v_metodo = 'QR' THEN 'qr:' || substr(md5(random()::text), 1, 10)
                             ELSE upper(substr(md5(random()::text), 1, 8)) END,
                        'ENTRADA', 'DENEGADO',
                        CASE WHEN v_metodo = 'QR' THEN 'QR expirado' ELSE 'Credencial no registrada' END,
                        pg_temp.entre(90, 450), v_ts);
            ELSE
                INSERT INTO log_acceso (punto_acceso_id, socio_id, metodo, credencial_leida, direccion,
                                        resultado, latencia_ms, ocurrido_en)
                VALUES (CASE WHEN random() < 0.65 THEN v_veh ELSE v_pea END,
                        v_socios[v_idx], v_metodo,
                        CASE v_metodo WHEN 'RFID' THEN v_uids[v_idx]
                                      WHEN 'QR'   THEN 'qr:' || substr(md5(random()::text), 1, 10) END,
                        CASE WHEN v_min < 12 * 60 THEN
                                  CASE WHEN random() < 0.65 THEN 'ENTRADA' ELSE 'SALIDA' END
                             ELSE CASE WHEN random() < 0.45 THEN 'ENTRADA' ELSE 'SALIDA' END
                        END::direccion_acceso,
                        'PERMITIDO',
                        -- Latencia simulada: suma de uniformes ≈ campana; QR es más lento que RFID
                        CASE v_metodo
                            WHEN 'RFID' THEN 80  + floor((random() + random() + random()) * 220)::int
                            WHEN 'QR'   THEN 150 + floor((random() + random() + random()) * 380)::int
                        END,
                        v_ts);
            END IF;
        END LOOP;
    END LOOP;

    -- Caso de demo: la tarjeta perdida DEADBEEF fue usada hace unos días y se denegó
    INSERT INTO log_acceso (punto_acceso_id, socio_id, metodo, credencial_leida, direccion, resultado, motivo, latencia_ms, ocurrido_en)
    SELECT v_veh, id, 'RFID', 'DEADBEEF', 'ENTRADA', 'DENEGADO', 'Credencial reportada como perdida', 212,
           pg_temp.ts(v_hoy - 4, 22 * 60 + 47)
    FROM socio WHERE numero_socio = '00247';

    -- ---------------- Invitados: ingresan por QR el día de su visita
    INSERT INTO log_acceso (punto_acceso_id, invitado_id, metodo, credencial_leida, direccion, resultado, latencia_ms, ocurrido_en)
    SELECT CASE WHEN i.placa_vehiculo IS NOT NULL THEN v_veh ELSE v_pea END,
           i.id, 'QR', 'qr:' || substr(md5(i.id::text), 1, 10), 'ENTRADA', 'PERMITIDO',
           150 + floor((random() + random() + random()) * 380)::int,
           pg_temp.ts(i.fecha_visita, pg_temp.entre(10 * 60, 19 * 60))
    FROM invitado i
    WHERE pg_temp.ts(i.fecha_visita, 10 * 60) < now();
    DELETE FROM log_acceso WHERE invitado_id IS NOT NULL AND ocurrido_en > now();

    -- ---------------- Personal: últimos 90 días (insumo de asistencia y nómina)
    FOR v_t IN
        SELECT t.id, t.cargo, t.fecha_ingreso, c.uid_tarjeta,
               row_number() OVER (PARTITION BY t.cargo ORDER BY t.dni) AS orden
        FROM trabajador t JOIN credencial_rfid c ON c.trabajador_id = t.id
    LOOP
        FOR v_dia IN SELECT generate_series(greatest(v_hoy - 90, v_t.fecha_ingreso), v_hoy, INTERVAL '1 day')::date LOOP
            v_fin_semana := extract(isodow FROM v_dia) >= 6;
            -- Guardias: turnos rotativos 06-14 / 14-22 / 22-06, todos los días.
            -- Resto: lunes a sábado 07:00-15:00 (administrativos 08:30-17:30, L-V).
            CONTINUE WHEN v_t.cargo <> 'GUARDIA' AND extract(isodow FROM v_dia) = 7;
            CONTINUE WHEN v_t.cargo = 'ADMINISTRATIVO' AND v_fin_semana;
            CONTINUE WHEN random() < 0.04;   -- inasistencias

            v_turno := CASE
                -- Rotación semanal; el doble módulo evita restos negativos en fechas pasadas
                WHEN v_t.cargo = 'GUARDIA' THEN ((((v_t.orden + (v_dia - v_hoy) / 7)::int % 3) + 3) % 3) * 8 * 60 + 6 * 60
                WHEN v_t.cargo = 'ADMINISTRATIVO' THEN 8 * 60 + 30
                ELSE 7 * 60 END;

            v_ts := pg_temp.ts(v_dia, v_turno + pg_temp.entre(-15, 10));
            CONTINUE WHEN v_ts > now();
            INSERT INTO log_acceso (punto_acceso_id, trabajador_id, metodo, credencial_leida, direccion, resultado, latencia_ms, ocurrido_en)
            VALUES (v_pea, v_t.id, 'RFID', v_t.uid_tarjeta, 'ENTRADA', 'PERMITIDO',
                    80 + floor((random() + random() + random()) * 220)::int, v_ts);

            v_ts := v_ts + INTERVAL '8 hours' + (pg_temp.entre(0, 25) * INTERVAL '1 minute');
            IF v_ts <= now() THEN
                INSERT INTO log_acceso (punto_acceso_id, trabajador_id, metodo, credencial_leida, direccion, resultado, latencia_ms, ocurrido_en)
                VALUES (v_pea, v_t.id, 'RFID', v_t.uid_tarjeta, 'SALIDA', 'PERMITIDO',
                        80 + floor((random() + random() + random()) * 220)::int, v_ts);
            END IF;
        END LOOP;
    END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- 9. Nómina: los dos meses anteriores cerrados y el mes en curso en borrador
-- -----------------------------------------------------------------------------
SELECT fn_generar_planilla((date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date,
                           (SELECT id FROM usuario WHERE login = 'admin'));
SELECT fn_generar_planilla((date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
                           (SELECT id FROM usuario WHERE login = 'admin'));
SELECT fn_generar_planilla(date_trunc('month', CURRENT_DATE)::date,
                           (SELECT id FROM usuario WHERE login = 'admin'));

UPDATE planilla SET estado = 'CERRADA', cerrada_en = (periodo + INTERVAL '1 month' + INTERVAL '2 days')
WHERE periodo < date_trunc('month', CURRENT_DATE);

-- Estadísticas actualizadas para el planificador de consultas
ANALYZE;
