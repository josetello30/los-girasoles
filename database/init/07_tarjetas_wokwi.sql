-- =============================================================================
-- 07_tarjetas_wokwi.sql   (Sprint 3)
-- Registra los UIDs de las 6 tarjetas que trae el lector RC522 del simulador
-- Wokwi, de modo que cada una demuestre un escenario distinto en la garita.
--
--   Tarjeta Wokwi        UID              Escenario                         Resultado
--   Azul (configurable)  A1:B2:C3:D4      Socio 00247 José Miguel           PERMITIDO
--   Verde                11:22:33:44      Socio 00289 Roberto (MOROSO)      PERMITIDO (la deuda no impide entrar)
--   Amarilla             55:66:77:88      Personal de limpieza              PERMITIDO (marca asistencia)
--   Roja                 AA:BB:CC:DD      Tarjeta PERDIDA del socio 00247   DENEGADO
--   Llavero              C0:FF:EE:99      No registrada                     DENEGADO
--   Tag NFC (7 bytes)    04:11:22:33:44:55:66  Socio 00150 SUSPENDIDO      DENEGADO
--
-- IDEMPOTENTE: se ejecuta solo al crear la BD (docker-entrypoint) y también
-- puede aplicarse sobre una BD existente sin borrarla:   make migrar
-- =============================================================================

SET TIME ZONE 'America/Lima';
BEGIN;

-- Verde -> socio moroso 00289: su tarjeta activa pasa a tener el UID de la tarjeta verde
UPDATE credencial_rfid c
SET uid_tarjeta = '11223344'
FROM socio s
WHERE s.id = c.socio_id AND s.numero_socio = '00289' AND c.estado = 'ACTIVA'
  AND NOT EXISTS (SELECT 1 FROM credencial_rfid WHERE uid_tarjeta = '11223344');

-- Amarilla -> personal de limpieza (antes C0FFEE01)
UPDATE credencial_rfid
SET uid_tarjeta = '55667788'
WHERE uid_tarjeta = 'C0FFEE01'
  AND NOT EXISTS (SELECT 1 FROM credencial_rfid WHERE uid_tarjeta = '55667788');

-- Roja -> tarjeta perdida del socio 00247 (antes DEADBEEF)
UPDATE credencial_rfid
SET uid_tarjeta = 'AABBCCDD'
WHERE uid_tarjeta = 'DEADBEEF'
  AND NOT EXISTS (SELECT 1 FROM credencial_rfid WHERE uid_tarjeta = 'AABBCCDD');
UPDATE log_acceso SET credencial_leida = 'AABBCCDD' WHERE credencial_leida = 'DEADBEEF';

-- Tag NFC -> socio 00150 suspendido (sanción disciplinaria simulada)
UPDATE socio SET estado = 'SUSPENDIDO' WHERE numero_socio = '00150' AND estado <> 'SUSPENDIDO';
UPDATE credencial_rfid c
SET uid_tarjeta = '04112233445566'
FROM socio s
WHERE s.id = c.socio_id AND s.numero_socio = '00150' AND c.estado = 'ACTIVA'
  AND NOT EXISTS (SELECT 1 FROM credencial_rfid WHERE uid_tarjeta = '04112233445566');

-- Llavero C0FFEE99: debe NO existir para demostrar el rechazo de tarjetas desconocidas
DELETE FROM credencial_rfid WHERE uid_tarjeta = 'C0FFEE99';

-- Verificación: las 5 tarjetas registradas deben existir con el estado esperado
DO $$
DECLARE
    v_faltan INT;
BEGIN
    SELECT 5 - count(*) INTO v_faltan
    FROM credencial_rfid
    WHERE (uid_tarjeta, estado) IN (('A1B2C3D4', 'ACTIVA'), ('11223344', 'ACTIVA'), ('55667788', 'ACTIVA'),
                                    ('AABBCCDD', 'PERDIDA'), ('04112233445566', 'ACTIVA'));
    IF v_faltan > 0 THEN
        RAISE EXCEPTION 'Faltan % tarjetas de Wokwi por registrar', v_faltan;
    END IF;
    RAISE NOTICE 'Tarjetas de Wokwi registradas correctamente';
END
$$;

COMMIT;
