-- =============================================================================
-- 03_funciones.sql
-- Funciones y triggers que protegen la integridad de los datos.
--
-- Códigos de error propios (SQLSTATE 'GRxxx'). El backend los traduce a
-- respuestas HTTP con mensajes en español (409 Conflict / 422 Unprocessable):
--   GR001  Instalación inactiva
--   GR002  Reserva fuera del horario de atención
--   GR003  Reserva que cruza la medianoche
--   GR004  Instalación bloqueada (mantenimiento / evento privado)
--   GR005  Aforo completo (instalaciones compartidas)
--   GR010  Cuota asignada a un socio que no es titular
--   GR011  Pago que excede el saldo de la cuota
--   GR012  Pago sobre una cuota anulada
--   GR020  Planilla ya cerrada
-- =============================================================================

SET TIME ZONE 'America/Lima';

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- Lee un parámetro numérico de la tabla 'parametro'. Falla si no existe,
-- para no operar en silencio con un valor por defecto equivocado.
CREATE OR REPLACE FUNCTION fn_parametro_num(p_clave TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_valor TEXT;
BEGIN
    SELECT valor INTO v_valor FROM parametro WHERE clave = p_clave;
    IF v_valor IS NULL THEN
        RAISE EXCEPTION 'Parámetro de configuración inexistente: %', p_clave;
    END IF;
    RETURN v_valor::NUMERIC;
END;
$$;

-- Mantiene la columna actualizado_en al día en cada UPDATE.
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_usuario_actualizado    BEFORE UPDATE ON usuario    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
CREATE TRIGGER tg_socio_actualizado      BEFORE UPDATE ON socio      FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
CREATE TRIGGER tg_trabajador_actualizado BEFORE UPDATE ON trabajador FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
CREATE TRIGGER tg_reserva_actualizado    BEFORE UPDATE ON reserva    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- Reservas: horario, bloqueos y aforo
-- (El solapamiento en instalaciones exclusivas lo resuelve la restricción EXCLUDE.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_reserva()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_inst      instalacion%ROWTYPE;
    v_inicio    TIMESTAMP;   -- hora local de Lima
    v_fin       TIMESTAMP;
    v_ocupados  INTEGER;
BEGIN
    SELECT * INTO v_inst FROM instalacion WHERE id = NEW.instalacion_id;

    -- Copia el tipo de uso para que la restricción EXCLUDE sepa si aplica.
    NEW.exclusiva := v_inst.exclusiva;

    -- Las cancelaciones no necesitan más validación.
    IF NEW.estado = 'CANCELADA' THEN
        RETURN NEW;
    END IF;

    -- En un UPDATE que no toca fecha ni instalación (ej. CONFIRMADA -> COMPLETADA) no se revalida.
    IF TG_OP = 'UPDATE'
       AND NEW.periodo = OLD.periodo
       AND NEW.instalacion_id = OLD.instalacion_id
       AND OLD.estado <> 'CANCELADA' THEN
        RETURN NEW;
    END IF;

    IF NOT v_inst.activa THEN
        RAISE EXCEPTION 'La instalación % no está disponible', v_inst.nombre
            USING ERRCODE = 'GR001';
    END IF;

    v_inicio := lower(NEW.periodo) AT TIME ZONE 'America/Lima';
    v_fin    := upper(NEW.periodo) AT TIME ZONE 'America/Lima';

    IF v_inicio::date <> (v_fin - INTERVAL '1 microsecond')::date THEN
        RAISE EXCEPTION 'La reserva debe iniciar y terminar el mismo día'
            USING ERRCODE = 'GR003';
    END IF;

    -- El fin se compara como intervalo desde la medianoche, para que una
    -- reserva que termina a las 00:00 no "pase" por comparar 00:00 < cierre.
    IF v_inicio::time < v_inst.hora_apertura
       OR (v_fin - v_inicio::date::timestamp) > v_inst.hora_cierre::interval THEN
        RAISE EXCEPTION '% atiende de % a %', v_inst.nombre,
              to_char(v_inst.hora_apertura, 'HH24:MI'), to_char(v_inst.hora_cierre, 'HH24:MI')
            USING ERRCODE = 'GR002';
    END IF;

    IF EXISTS (SELECT 1 FROM bloqueo_instalacion b
               WHERE b.instalacion_id = NEW.instalacion_id
                 AND b.periodo && NEW.periodo) THEN
        RAISE EXCEPTION '% está cerrada en ese horario por mantenimiento o evento', v_inst.nombre
            USING ERRCODE = 'GR004';
    END IF;

    -- Instalaciones compartidas (piscina): controlar el aforo.
    -- El candado transaccional serializa reservas simultáneas de la misma instalación.
    IF NOT v_inst.exclusiva THEN
        PERFORM pg_advisory_xact_lock(hashtext(NEW.instalacion_id::text));

        SELECT count(*) INTO v_ocupados
        FROM reserva r
        WHERE r.instalacion_id = NEW.instalacion_id
          AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
          AND r.periodo && NEW.periodo
          AND r.id <> NEW.id;

        IF v_ocupados >= v_inst.capacidad THEN
            RAISE EXCEPTION 'Aforo completo en % para ese horario (% personas)', v_inst.nombre, v_inst.capacidad
                USING ERRCODE = 'GR005';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_reserva_validar
    BEFORE INSERT OR UPDATE OF periodo, instalacion_id, estado ON reserva
    FOR EACH ROW EXECUTE FUNCTION fn_validar_reserva();

-- -----------------------------------------------------------------------------
-- Cuotas: la deuda siempre es del titular
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_cuota()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM socio WHERE id = NEW.socio_id AND tipo = 'TITULAR') THEN
        RAISE EXCEPTION 'Las cuotas se asignan al socio titular, no a un dependiente'
            USING ERRCODE = 'GR010';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_cuota_validar
    BEFORE INSERT OR UPDATE OF socio_id ON cuota
    FOR EACH ROW EXECUTE FUNCTION fn_validar_cuota();

-- -----------------------------------------------------------------------------
-- Pagos: nunca se paga más que el saldo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_pago()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_cuota   cuota%ROWTYPE;
    v_pagado  NUMERIC(10,2);
BEGIN
    IF NEW.estado <> 'APROBADO' THEN
        RETURN NEW;
    END IF;

    -- FOR UPDATE bloquea la cuota: dos pagos simultáneos no pueden superar el saldo.
    SELECT * INTO v_cuota FROM cuota WHERE id = NEW.cuota_id FOR UPDATE;

    IF v_cuota.anulada THEN
        RAISE EXCEPTION 'No se puede pagar una cuota anulada' USING ERRCODE = 'GR012';
    END IF;

    SELECT COALESCE(sum(monto), 0) INTO v_pagado
    FROM pago
    WHERE cuota_id = NEW.cuota_id AND estado = 'APROBADO' AND id <> NEW.id;

    IF v_pagado + NEW.monto > v_cuota.monto THEN
        RAISE EXCEPTION 'El pago (S/ %) supera el saldo pendiente (S/ %)',
              NEW.monto, v_cuota.monto - v_pagado
            USING ERRCODE = 'GR011';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_pago_validar
    BEFORE INSERT OR UPDATE OF estado, monto ON pago
    FOR EACH ROW EXECUTE FUNCTION fn_validar_pago();

-- -----------------------------------------------------------------------------
-- Tienda: el total del pedido siempre es la suma de su detalle
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalcular_total_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_pedido UUID := COALESCE(NEW.pedido_id, OLD.pedido_id);
BEGIN
    UPDATE pedido
    SET total = (SELECT COALESCE(sum(cantidad * precio_unitario), 0)
                 FROM detalle_pedido WHERE pedido_id = v_pedido)
    WHERE id = v_pedido;
    RETURN NULL;
END;
$$;

CREATE TRIGGER tg_detalle_pedido_total
    AFTER INSERT OR UPDATE OR DELETE ON detalle_pedido
    FOR EACH ROW EXECUTE FUNCTION fn_recalcular_total_pedido();

-- -----------------------------------------------------------------------------
-- Emisión mensual de cuotas de mantenimiento
-- Idempotente: si se ejecuta dos veces en el mismo mes no duplica cuotas.
-- El backend la invocará con un job programado el día 1 de cada mes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_emitir_cuotas_mantenimiento(p_periodo DATE)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_mes       DATE := date_trunc('month', p_periodo)::date;
    v_monto     NUMERIC := fn_parametro_num('cuota_mantenimiento_monto');
    v_insertadas INTEGER;
BEGIN
    INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_emision, fecha_vencimiento)
    SELECT s.id,
           'MANTENIMIENTO',
           v_mes,
           'Cuota de mantenimiento ' || to_char(v_mes, 'TMMonth YYYY'),
           v_monto,
           v_mes,
           (v_mes + INTERVAL '1 month - 1 day')::date
    FROM socio s
    WHERE s.tipo = 'TITULAR'
      AND s.estado = 'ACTIVO'
      AND s.fecha_afiliacion <= (v_mes + INTERVAL '1 month - 1 day')::date
    ON CONFLICT (socio_id, periodo) WHERE concepto = 'MANTENIMIENTO' AND NOT anulada
    DO NOTHING;

    GET DIAGNOSTICS v_insertadas = ROW_COUNT;
    RETURN v_insertadas;
END;
$$;

-- -----------------------------------------------------------------------------
-- Nómina simulada
-- Tasas tomadas de la tabla 'parametro' (referenciales, no asesoría laboral):
--   ONP 13 % | AFP ~ aporte + prima + comisión | EsSalud 9 % a cargo del empleador.
-- Los días asistidos se cuentan desde los ingresos por garita (log_acceso).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generar_planilla(p_periodo DATE, p_usuario UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_mes       DATE := date_trunc('month', p_periodo)::date;
    v_fin_mes   DATE := (date_trunc('month', p_periodo) + INTERVAL '1 month - 1 day')::date;
    v_planilla  planilla%ROWTYPE;
    v_tasa_onp  NUMERIC := fn_parametro_num('nomina_tasa_onp');
    v_tasa_afp  NUMERIC := fn_parametro_num('nomina_tasa_afp');
    v_tasa_ess  NUMERIC := fn_parametro_num('nomina_tasa_essalud');
BEGIN
    SELECT * INTO v_planilla FROM planilla WHERE periodo = v_mes;

    IF FOUND AND v_planilla.estado = 'CERRADA' THEN
        RAISE EXCEPTION 'La planilla de % ya está cerrada', to_char(v_mes, 'MM/YYYY')
            USING ERRCODE = 'GR020';
    END IF;

    IF NOT FOUND THEN
        INSERT INTO planilla (periodo, generada_por) VALUES (v_mes, p_usuario)
        RETURNING * INTO v_planilla;
    ELSE
        -- Regenerar un borrador: se recalculan todas las boletas.
        DELETE FROM boleta WHERE planilla_id = v_planilla.id;
        UPDATE planilla SET generada_en = now(), generada_por = p_usuario WHERE id = v_planilla.id;
    END IF;

    INSERT INTO boleta (planilla_id, trabajador_id, sueldo_base, regimen_pension,
                        descuento_pension, monto_neto, aporte_essalud, dias_asistidos)
    SELECT v_planilla.id,
           t.id,
           t.sueldo_base,
           t.regimen_pension,
           calc.descuento,
           t.sueldo_base - calc.descuento,
           round(t.sueldo_base * v_tasa_ess, 2),
           COALESCE(asist.dias, 0)
    FROM trabajador t
    CROSS JOIN LATERAL (
        SELECT round(t.sueldo_base * CASE t.regimen_pension WHEN 'ONP' THEN v_tasa_onp ELSE v_tasa_afp END, 2)
               AS descuento
    ) calc
    LEFT JOIN LATERAL (
        SELECT count(DISTINCT (l.ocurrido_en AT TIME ZONE 'America/Lima')::date) AS dias
        FROM log_acceso l
        WHERE l.trabajador_id = t.id
          AND l.resultado = 'PERMITIDO'
          AND l.direccion = 'ENTRADA'
          AND (l.ocurrido_en AT TIME ZONE 'America/Lima')::date BETWEEN v_mes AND v_fin_mes
    ) asist ON TRUE
    WHERE t.activo
      AND t.fecha_ingreso <= v_fin_mes;

    RETURN v_planilla.id;
END;
$$;
