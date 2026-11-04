-- =============================================================================
-- pruebas_integridad.sql
-- Pruebas automáticas de las reglas de integridad de la base de datos.
-- Cada prueba intenta una operación PROHIBIDA y verifica que PostgreSQL la
-- rechace con el código de error esperado. Todo corre dentro de una
-- transacción que se revierte al final: no deja basura en la BD.
--
-- Uso:  docker compose exec -T postgres psql -U girasoles -d girasoles < database/tests/pruebas_integridad.sql
-- =============================================================================
\set ON_ERROR_STOP on
SET client_min_messages = notice;
\o /dev/null
BEGIN;

-- Ejecuta una sentencia que DEBE fallar con el SQLSTATE indicado.
CREATE FUNCTION pg_temp.debe_fallar(p_id TEXT, p_desc TEXT, p_sql TEXT, p_codigo TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = p_codigo THEN
            RAISE NOTICE '[OK]    %  %  -> rechazado (%: %)', p_id, p_desc, SQLSTATE, SQLERRM;
            RETURN;
        END IF;
        RAISE EXCEPTION '[FALLA] %  %  -> se esperaba % y llegó %: %', p_id, p_desc, p_codigo, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION '[FALLA] %  %  -> la operación NO fue rechazada', p_id, p_desc;
END;
$$;

-- Datos de apoyo: un socio titular, un dependiente y una franja libre mañana
CREATE TEMP TABLE ctx AS
SELECT
    (SELECT id FROM socio WHERE numero_socio = '00247')                      AS titular,
    (SELECT id FROM socio WHERE tipo = 'DEPENDIENTE' LIMIT 1)               AS dependiente,
    (SELECT id FROM instalacion WHERE codigo = 'FRONTON-1')                 AS fronton,
    (SELECT id FROM instalacion WHERE codigo = 'PISCINA-1')                 AS piscina,
    (SELECT id FROM trabajador LIMIT 1)                                     AS trabajador,
    ((CURRENT_DATE + 30)::timestamp AT TIME ZONE 'America/Lima')            AS dia;   -- sin reservas previas
GRANT SELECT ON ctx TO PUBLIC;

-- Reserva base válida: frontón 10:00-11:00 dentro de 30 días
INSERT INTO reserva (socio_id, instalacion_id, periodo, estado)
SELECT titular, fronton, tstzrange(dia + INTERVAL '10 hours', dia + INTERVAL '11 hours', '[)'), 'CONFIRMADA' FROM ctx;

-- ------------------------------------------------------------------ reservas
SELECT pg_temp.debe_fallar('R01', 'Reserva solapada en instalación exclusiva', $q$
    INSERT INTO reserva (socio_id, instalacion_id, periodo, estado)
    SELECT dependiente, fronton, tstzrange(dia + INTERVAL '10 hours 30 minutes', dia + INTERVAL '11 hours 30 minutes', '[)'), 'PENDIENTE' FROM ctx
$q$, '23P01');

SELECT pg_temp.debe_fallar('R02', 'Reserva fuera del horario de atención', $q$
    INSERT INTO reserva (socio_id, instalacion_id, periodo)
    SELECT titular, fronton, tstzrange(dia + INTERVAL '20 hours', dia + INTERVAL '21 hours', '[)') FROM ctx
$q$, 'GR002');

SELECT pg_temp.debe_fallar('R03', 'Reserva que cruza la medianoche', $q$
    INSERT INTO reserva (socio_id, instalacion_id, periodo)
    SELECT titular, fronton, tstzrange(dia + INTERVAL '18 hours', dia + INTERVAL '1 day 8 hours', '[)') FROM ctx
$q$, 'GR003');

SELECT pg_temp.debe_fallar('R04', 'Reserva durante un mantenimiento programado', $q$
    INSERT INTO reserva (socio_id, instalacion_id, periodo)
    SELECT c.titular, c.piscina, tstzrange(lower(b.periodo) + INTERVAL '10 hours', lower(b.periodo) + INTERVAL '11 hours', '[)')
    FROM ctx c JOIN bloqueo_instalacion b ON b.instalacion_id = c.piscina
$q$, 'GR004');

-- Aforo: se reduce temporalmente la capacidad de la piscina a 1
UPDATE instalacion SET capacidad = 1 WHERE codigo = 'PISCINA-1';
INSERT INTO reserva (socio_id, instalacion_id, periodo)
SELECT titular, piscina, tstzrange(dia + INTERVAL '9 hours', dia + INTERVAL '10 hours', '[)') FROM ctx;
SELECT pg_temp.debe_fallar('R05', 'Reserva que supera el aforo de la piscina', $q$
    INSERT INTO reserva (socio_id, instalacion_id, periodo)
    SELECT dependiente, piscina, tstzrange(dia + INTERVAL '9 hours', dia + INTERVAL '10 hours', '[)') FROM ctx
$q$, 'GR005');

-- Una reserva cancelada libera la franja: debe poder volver a reservarse
UPDATE reserva SET estado = 'CANCELADA', cancelada_en = now()
WHERE instalacion_id = (SELECT fronton FROM ctx) AND lower(periodo) = (SELECT dia + INTERVAL '10 hours' FROM ctx);
INSERT INTO reserva (socio_id, instalacion_id, periodo)
SELECT dependiente, fronton, tstzrange(dia + INTERVAL '10 hours', dia + INTERVAL '11 hours', '[)') FROM ctx;
DO $$ BEGIN RAISE NOTICE '[OK]    R06  Una franja cancelada vuelve a estar disponible'; END $$;

-- ------------------------------------------------------------------ pagos
SELECT pg_temp.debe_fallar('P01', 'Cuota cargada a un dependiente', $q$
    INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_vencimiento)
    SELECT dependiente, 'OTRO', date_trunc('month', CURRENT_DATE), 'Prueba', 50, CURRENT_DATE FROM ctx
$q$, 'GR010');

SELECT pg_temp.debe_fallar('P02', 'Pago mayor que el saldo de la cuota', $q$
    INSERT INTO pago (cuota_id, monto, metodo)
    -- Cualquier cuota con saldo (siempre hay morosos). No se usa al socio 00247: es "puntual"
    -- y, según el día del mes en que se crea la BD, puede no tener ninguna cuota pendiente.
    SELECT cuota_id, saldo + 1, 'EFECTIVO' FROM v_saldo_cuota
    WHERE saldo > 0 ORDER BY saldo DESC, cuota_id LIMIT 1
$q$, 'GR011');

SELECT pg_temp.debe_fallar('P03', 'Segunda cuota de mantenimiento en el mismo mes', $q$
    INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_vencimiento)
    SELECT titular, 'MANTENIMIENTO', date_trunc('month', CURRENT_DATE), 'Duplicada', 180, CURRENT_DATE + 20 FROM ctx
$q$, '23505');

DO $$
DECLARE v INT;
BEGIN
    v := fn_emitir_cuotas_mantenimiento(CURRENT_DATE);
    IF v <> 0 THEN RAISE EXCEPTION '[FALLA] P04 la emisión mensual duplicó % cuotas', v; END IF;
    RAISE NOTICE '[OK]    P04  La emisión mensual de cuotas es idempotente (0 duplicados)';
END $$;

-- ------------------------------------------------------------------ datos
SELECT pg_temp.debe_fallar('D01', 'DNI con formato inválido', $q$
    INSERT INTO socio (numero_socio, tipo, dni, nombres, apellidos, lote) VALUES ('09999', 'TITULAR', '12AB', 'X', 'Y', 'Z-01')
$q$, '23514');

SELECT pg_temp.debe_fallar('D02', 'Dependiente sin titular', $q$
    INSERT INTO socio (numero_socio, tipo, parentesco, dni, nombres, apellidos) VALUES ('09998-01', 'DEPENDIENTE', 'HIJO', '99999998', 'X', 'Y')
$q$, '23514');

SELECT pg_temp.debe_fallar('D03', 'Tarjeta RFID asignada a socio y trabajador a la vez', $q$
    INSERT INTO credencial_rfid (uid_tarjeta, socio_id, trabajador_id) SELECT 'ABCDEF12', titular, trabajador FROM ctx
$q$, '23514');

SELECT pg_temp.debe_fallar('D04', 'Tarjeta RFID duplicada', $q$
    INSERT INTO credencial_rfid (uid_tarjeta, socio_id) SELECT 'A1B2C3D4', titular FROM ctx
$q$, '23505');

-- ------------------------------------------------------------------ privilegios
SET LOCAL ROLE girasoles_app;
SELECT pg_temp.debe_fallar('S01', 'El backend intenta borrar el log de accesos', $q$
    DELETE FROM log_acceso WHERE id = 1
$q$, '42501');
SELECT pg_temp.debe_fallar('S02', 'El backend intenta modificar el monto de un pago', $q$
    UPDATE pago SET monto = 1 WHERE id = (SELECT id FROM pago LIMIT 1)
$q$, '42501');
SELECT pg_temp.debe_fallar('S03', 'El backend intenta alterar el esquema', $q$
    ALTER TABLE socio ADD COLUMN hack TEXT
$q$, '42501');
RESET ROLE;

SET LOCAL ROLE girasoles_dashboard;
SELECT pg_temp.debe_fallar('S04', 'El dashboard intenta leer los hashes de contraseñas', $q$
    SELECT password_hash FROM usuario LIMIT 1
$q$, '42501');
SELECT pg_temp.debe_fallar('S05', 'El dashboard intenta escribir datos', $q$
    UPDATE socio SET estado = 'BAJA' WHERE numero_socio = '00001'
$q$, '42501');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE '>>> Todas las pruebas de integridad pasaron'; END $$;
ROLLBACK;
