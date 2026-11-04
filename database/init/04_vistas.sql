-- =============================================================================
-- 04_vistas.sql
-- Vistas de lectura. Son la "interfaz" que consume el dashboard de Streamlit
-- (rol dashboard_ro) y que reutiliza el backend para estados de cuenta.
-- Los estados de deuda se CALCULAN aquí, no se almacenan: así nunca quedan
-- desincronizados de los pagos reales.
-- =============================================================================

SET TIME ZONE 'America/Lima';

-- -----------------------------------------------------------------------------
-- Saldo y estado de cada cuota (excluye anuladas)
-- -----------------------------------------------------------------------------
CREATE VIEW v_saldo_cuota AS
SELECT
    c.id                                   AS cuota_id,
    c.socio_id,
    c.concepto,
    c.periodo,
    c.descripcion,
    c.monto,
    c.fecha_emision,
    c.fecha_vencimiento,
    COALESCE(p.pagado, 0)                  AS pagado,
    c.monto - COALESCE(p.pagado, 0)        AS saldo,
    p.ultimo_pago,
    CASE
        WHEN c.monto - COALESCE(p.pagado, 0) <= 0 THEN 'PAGADA'
        WHEN c.fecha_vencimiento < CURRENT_DATE  THEN 'VENCIDA'
        ELSE 'PENDIENTE'
    END                                    AS estado,
    CASE
        WHEN c.monto - COALESCE(p.pagado, 0) > 0 AND c.fecha_vencimiento < CURRENT_DATE
        THEN CURRENT_DATE - c.fecha_vencimiento
        ELSE 0
    END                                    AS dias_mora
FROM cuota c
LEFT JOIN (
    SELECT cuota_id, sum(monto) AS pagado, max(pagado_en) AS ultimo_pago
    FROM pago
    WHERE estado = 'APROBADO'
    GROUP BY cuota_id
) p ON p.cuota_id = c.id
WHERE NOT c.anulada;

-- -----------------------------------------------------------------------------
-- Estado de cuenta por TITULAR (RF05: Al día / Pendiente / Vencido)
--   AL_DIA    : ninguna cuota vencida. Puede tener saldo del mes en curso que
--               aún no vence (se muestra en deuda_total, pero no está atrasado).
--   PENDIENTE : tiene cuotas vencidas, pero dentro del periodo de gracia.
--   VENCIDO   : alguna cuota supera el periodo de gracia (parámetro
--               'morosidad_dias_gracia'). Es el que cuenta como MOROSO y el
--               único estado que bloquea reservas.
-- -----------------------------------------------------------------------------
CREATE VIEW v_estado_cuenta AS
SELECT
    s.id                                                         AS socio_id,
    s.numero_socio,
    s.nombres,
    s.apellidos,
    s.lote,
    s.estado                                                     AS estado_socio,
    COALESCE(sum(v.saldo)  FILTER (WHERE v.saldo > 0), 0)        AS deuda_total,
    COALESCE(sum(v.saldo)  FILTER (WHERE v.estado = 'VENCIDA'), 0) AS deuda_vencida,
    count(*)               FILTER (WHERE v.estado = 'VENCIDA')   AS cuotas_vencidas,
    COALESCE(max(v.dias_mora), 0)                                AS dias_mora_max,
    CASE
        WHEN COALESCE(max(v.dias_mora), 0) > fn_parametro_num('morosidad_dias_gracia') THEN 'VENCIDO'
        WHEN count(*) FILTER (WHERE v.estado = 'VENCIDA') > 0                           THEN 'PENDIENTE'
        ELSE 'AL_DIA'
    END                                                          AS estado_pago
FROM socio s
LEFT JOIN v_saldo_cuota v ON v.socio_id = s.id
WHERE s.tipo = 'TITULAR'
GROUP BY s.id;

-- -----------------------------------------------------------------------------
-- Cada socio (titulares y dependientes) con el estado de pago de su titular.
-- Lo usa el backend para decidir si un dependiente puede reservar.
-- -----------------------------------------------------------------------------
CREATE VIEW v_socio_detalle AS
SELECT
    s.id                AS socio_id,
    s.numero_socio,
    s.tipo,
    s.parentesco,
    s.nombres,
    s.apellidos,
    s.dni,
    COALESCE(s.lote, t.lote)            AS lote,
    s.email,
    s.telefono,
    s.estado            AS estado_socio,
    s.fecha_afiliacion,
    t.id                AS titular_id,
    t.numero_socio      AS numero_titular,
    e.estado_pago,
    e.deuda_total,
    e.deuda_vencida,
    e.dias_mora_max
FROM socio s
JOIN socio t           ON t.id = COALESCE(s.titular_id, s.id)
JOIN v_estado_cuenta e ON e.socio_id = t.id;

-- -----------------------------------------------------------------------------
-- KPIs de cabecera del dashboard (RF04). Devuelve una sola fila.
-- -----------------------------------------------------------------------------
CREATE VIEW v_kpi_resumen AS
WITH mes AS (
    SELECT date_trunc('month', now()) AS inicio,
           date_trunc('month', now()) + INTERVAL '1 month' AS fin
)
SELECT
    (SELECT count(*) FROM socio WHERE estado = 'ACTIVO')                           AS total_socios,
    (SELECT count(*) FROM socio WHERE estado = 'ACTIVO' AND tipo = 'TITULAR')      AS titulares,
    (SELECT count(*) FROM socio WHERE estado = 'ACTIVO' AND tipo = 'DEPENDIENTE')  AS dependientes,
    (SELECT count(*) FROM reserva r, mes
      WHERE r.estado <> 'CANCELADA'
        AND lower(r.periodo) >= mes.inicio AND lower(r.periodo) < mes.fin)        AS reservas_mes,
    (SELECT COALESCE(sum(p.monto), 0) FROM pago p, mes
      WHERE p.estado = 'APROBADO'
        AND p.pagado_en >= mes.inicio AND p.pagado_en < mes.fin)                  AS recaudacion_mes,
    (SELECT round(100.0 * count(*) FILTER (WHERE estado_pago = 'VENCIDO')
                  / NULLIF(count(*), 0), 1)
       FROM v_estado_cuenta WHERE estado_socio = 'ACTIVO')                        AS tasa_morosidad_pct,
    (SELECT COALESCE(sum(deuda_vencida), 0) FROM v_estado_cuenta)                 AS deuda_vencida_total,
    (SELECT count(*) FROM log_acceso
      WHERE ocurrido_en >= date_trunc('day', now())
        AND direccion = 'ENTRADA' AND resultado = 'PERMITIDO')                    AS accesos_hoy,
    (SELECT round(avg(latencia_ms)) FROM log_acceso
      WHERE ocurrido_en >= now() - INTERVAL '7 days')                             AS latencia_promedio_ms,
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms)::int
       FROM log_acceso WHERE ocurrido_en >= now() - INTERVAL '7 days')            AS latencia_p95_ms;

-- -----------------------------------------------------------------------------
-- Reservas por día y tipo de instalación (gráfico de barras semanal)
-- -----------------------------------------------------------------------------
CREATE VIEW v_reservas_diarias AS
SELECT
    (lower(r.periodo) AT TIME ZONE 'America/Lima')::date AS fecha,
    i.tipo                                               AS tipo_instalacion,
    count(*)                                             AS reservas,
    COALESCE(sum(r.monto), 0)                            AS monto
FROM reserva r
JOIN instalacion i ON i.id = r.instalacion_id
WHERE r.estado <> 'CANCELADA'
GROUP BY 1, 2;

-- -----------------------------------------------------------------------------
-- Ocupación por instalación en los últimos 30 días (barras de progreso)
-- Ocupación = horas-persona reservadas / horas-persona disponibles
-- -----------------------------------------------------------------------------
CREATE VIEW v_ocupacion_instalacion AS
SELECT
    i.id                AS instalacion_id,
    i.codigo,
    i.nombre,
    i.tipo,
    round(COALESCE(sum(EXTRACT(EPOCH FROM upper(r.periodo) - lower(r.periodo)) / 3600), 0)::numeric, 1)
                        AS horas_reservadas,
    round((30 * EXTRACT(EPOCH FROM i.hora_cierre - i.hora_apertura) / 3600
           * CASE WHEN i.exclusiva THEN 1 ELSE i.capacidad END)::numeric, 1)
                        AS horas_disponibles,
    round(100 * COALESCE(sum(EXTRACT(EPOCH FROM upper(r.periodo) - lower(r.periodo)) / 3600), 0)
          / (30 * EXTRACT(EPOCH FROM i.hora_cierre - i.hora_apertura) / 3600
             * CASE WHEN i.exclusiva THEN 1 ELSE i.capacidad END), 1)
                        AS ocupacion_pct
FROM instalacion i
LEFT JOIN reserva r
       ON r.instalacion_id = i.id
      AND r.estado <> 'CANCELADA'
      AND lower(r.periodo) >= now() - INTERVAL '30 days'
      AND lower(r.periodo) <  now()
WHERE i.activa
GROUP BY i.id;

-- -----------------------------------------------------------------------------
-- Recaudación mensual por concepto (gráfico de líneas / barras apiladas)
-- -----------------------------------------------------------------------------
CREATE VIEW v_recaudacion_mensual AS
SELECT
    date_trunc('month', p.pagado_en AT TIME ZONE 'America/Lima')::date AS mes,
    c.concepto,
    p.metodo,
    count(*)        AS pagos,
    sum(p.monto)    AS total
FROM pago p
JOIN cuota c ON c.id = p.cuota_id
WHERE p.estado = 'APROBADO'
GROUP BY 1, 2, 3;

-- -----------------------------------------------------------------------------
-- Log de accesos con el nombre de la persona (registro en vivo del RF05)
-- -----------------------------------------------------------------------------
CREATE VIEW v_accesos_detalle AS
SELECT
    l.id,
    l.ocurrido_en,
    pa.codigo           AS punto_acceso,
    pa.tipo             AS tipo_punto,
    CASE
        WHEN l.socio_id      IS NOT NULL THEN 'SOCIO'
        WHEN l.trabajador_id IS NOT NULL THEN 'TRABAJADOR'
        WHEN l.invitado_id   IS NOT NULL THEN 'INVITADO'
        ELSE 'DESCONOCIDO'
    END                 AS tipo_persona,
    COALESCE(s.nombres || ' ' || s.apellidos,
             t.nombres || ' ' || t.apellidos,
             i.nombres || ' ' || i.apellidos,
             'Credencial no registrada')                 AS persona,
    COALESCE(s.numero_socio, t.cargo::text, 'Invitado') AS referencia,
    COALESCE(s.lote, ts.lote, anf.lote)                  AS lote,
    l.metodo,
    l.direccion,
    l.resultado,
    l.motivo,
    l.credencial_leida,
    l.latencia_ms
FROM log_acceso l
JOIN punto_acceso pa  ON pa.id = l.punto_acceso_id
LEFT JOIN socio s       ON s.id = l.socio_id
LEFT JOIN socio ts      ON ts.id = s.titular_id
LEFT JOIN trabajador t  ON t.id = l.trabajador_id
LEFT JOIN invitado i    ON i.id = l.invitado_id
LEFT JOIN socio anf     ON anf.id = i.socio_anfitrion_id;

-- -----------------------------------------------------------------------------
-- Asistencia diaria del personal (insumo de la nómina)
-- -----------------------------------------------------------------------------
CREATE VIEW v_asistencia_personal AS
SELECT
    t.id                                                    AS trabajador_id,
    t.nombres || ' ' || t.apellidos                         AS trabajador,
    t.cargo,
    (l.ocurrido_en AT TIME ZONE 'America/Lima')::date       AS fecha,
    min(l.ocurrido_en) FILTER (WHERE l.direccion = 'ENTRADA') AS hora_entrada,
    max(l.ocurrido_en) FILTER (WHERE l.direccion = 'SALIDA')  AS hora_salida
FROM log_acceso l
JOIN trabajador t ON t.id = l.trabajador_id
WHERE l.resultado = 'PERMITIDO'
GROUP BY t.id, 4;
