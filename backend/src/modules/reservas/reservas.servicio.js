/**
 * Instalaciones, disponibilidad y reservas (RF02).
 *
 * Reglas de negocio aplicadas aquí (las de integridad las garantiza la BD):
 *   - No se reserva en el pasado ni con más anticipación que 'reserva_antelacion_dias'.
 *   - Un titular MOROSO (estado VENCIDO) y su familia no pueden reservar.
 *   - Máximo 'reserva_max_activas' reservas vigentes por socio.
 *   - Reservas con tarifa quedan PENDIENTES hasta pagarse; las gratuitas se confirman.
 */
'use strict';

const db = require('../../db');
const config = require('../../config/env');
const { errores } = require('../../utils/errores');
const { hoyLima, sumarDias } = require('../../utils/tiempo');

const ESTADOS_ACTIVOS = "('PENDIENTE','CONFIRMADA','COMPLETADA')";

/**
 * Franjas horarias de una fecha con su ocupación.
 * Si instalacionId es null devuelve las de todas las instalaciones activas.
 */
async function franjas(fecha, instalacionId = null) {
  const { rows } = await db.query(
    `WITH inst AS (
        SELECT * FROM instalacion WHERE activa AND ($2::uuid IS NULL OR id = $2)
     ),
     -- Primero se aíslan las reservas y bloqueos de ESE día (pocas filas)
     dia AS (
        SELECT tstzrange(($1::date)::timestamp AT TIME ZONE 'America/Lima',
                         ($1::date + 1)::timestamp AT TIME ZONE 'America/Lima', '[)') AS rango
     ),
     res_dia AS (
        SELECT r.instalacion_id, r.periodo FROM reserva r, dia
        WHERE r.estado IN ${ESTADOS_ACTIVOS} AND r.periodo && dia.rango
     ),
     blo_dia AS (
        SELECT b.instalacion_id, b.periodo FROM bloqueo_instalacion b, dia
        WHERE b.periodo && dia.rango
     ),
     slots AS (
        SELECT i.id AS instalacion_id, i.exclusiva, i.capacidad,
               (gs AT TIME ZONE 'America/Lima') AS inicio,
               ((gs + make_interval(mins => i.duracion_bloque_min)) AT TIME ZONE 'America/Lima') AS fin
        FROM inst i,
             generate_series($1::date + i.hora_apertura,
                             $1::date + i.hora_cierre - make_interval(mins => i.duracion_bloque_min),
                             make_interval(mins => i.duracion_bloque_min)) AS gs
     )
     SELECT s.instalacion_id,
            to_char(s.inicio AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora_inicio,
            to_char(s.fin    AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora_fin,
            s.exclusiva, s.capacidad,
            (SELECT count(*) FROM res_dia r
              WHERE r.instalacion_id = s.instalacion_id
                AND r.periodo && tstzrange(s.inicio, s.fin, '[)')) AS ocupados,
            EXISTS (SELECT 1 FROM blo_dia b
                     WHERE b.instalacion_id = s.instalacion_id
                       AND b.periodo && tstzrange(s.inicio, s.fin, '[)')) AS bloqueado,
            s.inicio <= now() AS pasado
     FROM slots s
     ORDER BY s.instalacion_id, s.inicio`,
    [fecha, instalacionId],
  );

  return rows.map((f) => {
    const cupos = f.exclusiva ? (f.ocupados > 0 ? 0 : 1) : Math.max(f.capacidad - f.ocupados, 0);
    return {
      instalacion_id: f.instalacion_id,
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin,
      disponible: !f.pasado && !f.bloqueado && cupos > 0,
      motivo: f.pasado ? 'PASADO' : f.bloqueado ? 'MANTENIMIENTO' : cupos === 0 ? 'OCUPADO' : null,
      cupos_libres: f.exclusiva ? undefined : cupos,
    };
  });
}

/** Lista de instalaciones con cuántas franjas libres tienen en la fecha (pantalla "Reservas"). */
async function listarInstalaciones(fecha) {
  const [{ rows: instalaciones }, todas] = await Promise.all([
    db.query(
      `SELECT id, codigo, nombre, tipo, descripcion, capacidad, exclusiva, tarifa_hora,
              to_char(hora_apertura, 'HH24:MI') AS hora_apertura,
              to_char(hora_cierre,   'HH24:MI') AS hora_cierre,
              duracion_bloque_min, imagen_url
       FROM instalacion WHERE activa ORDER BY tipo, codigo`,
    ),
    franjas(fecha),
  ]);

  return instalaciones.map((i) => {
    const propias = todas.filter((f) => f.instalacion_id === i.id);
    const libres = propias.filter((f) => f.disponible).length;
    return {
      ...i,
      fecha,
      horarios_disponibles: libres,
      estado: libres > 0 ? 'LIBRE' : propias.some((f) => f.motivo === 'MANTENIMIENTO') ? 'MANTENIMIENTO' : 'LLENO',
    };
  });
}

async function disponibilidad(instalacionId, fecha) {
  const { rows } = await db.query(
    'SELECT id, codigo, nombre, tipo, tarifa_hora, duracion_bloque_min FROM instalacion WHERE id = $1 AND activa',
    [instalacionId],
  );
  if (!rows.length) throw errores.noEncontrado('Instalación no encontrada');
  const lista = await franjas(fecha, instalacionId);
  return { instalacion: rows[0], fecha, franjas: lista.map(({ instalacion_id, ...f }) => f) };
}

/** Verifica que el socio pueda reservar (morosidad y límite de reservas vigentes). */
async function validarSocioPuedeReservar(cliente, socioId) {
  const { rows } = await cliente.query(
    `SELECT sd.estado_socio, sd.estado_pago, sd.deuda_vencida, sd.titular_id,
            (SELECT count(*) FROM reserva r
              WHERE r.socio_id = sd.socio_id
                AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
                AND upper(r.periodo) > now()) AS vigentes
     FROM v_socio_detalle sd WHERE sd.socio_id = $1`,
    [socioId],
  );
  const socio = rows[0];
  if (!socio) throw errores.noEncontrado('Socio no encontrado');

  if (socio.estado_socio !== 'ACTIVO') {
    throw errores.prohibido('Tu membresía no está activa. Acércate a administración', 'SOCIO_NO_ACTIVO');
  }

  const bloqueaMorosos = (await db.parametro('morosidad_bloquea_reserva', cliente)) === 'true';
  if (bloqueaMorosos && socio.estado_pago === 'VENCIDO') {
    throw errores.prohibido(
      `Tu cuenta tiene S/ ${socio.deuda_vencida.toFixed(2)} vencidos. Regulariza tu pago para reservar`,
      'MOROSIDAD',
    );
  }

  const maximo = Number(await db.parametro('reserva_max_activas', cliente));
  if (socio.vigentes >= maximo) {
    throw errores.conflicto(`Ya tienes ${maximo} reservas vigentes, el máximo permitido`, 'LIMITE_RESERVAS');
  }
  return socio;
}

async function crearReserva(usuario, { instalacion_id, fecha, hora_inicio }) {
  return db.enTransaccion(async (cliente) => {
    // --- Ventana de reserva: desde ahora hasta N días
    const antelacion = Number(await db.parametro('reserva_antelacion_dias', cliente));
    const hoy = hoyLima();
    if (fecha < hoy) throw errores.noProcesable('No se puede reservar en una fecha pasada', 'FECHA_PASADA');
    if (fecha > sumarDias(hoy, antelacion)) {
      throw errores.noProcesable(`Solo puedes reservar con hasta ${antelacion} días de anticipación`, 'FUERA_DE_VENTANA');
    }

    const socio = await validarSocioPuedeReservar(cliente, usuario.socioId);

    // --- Instalación y franja alineada a sus bloques
    const { rows: inst } = await cliente.query(
      `SELECT id, nombre, tarifa_hora, duracion_bloque_min, hora_apertura,
              EXTRACT(EPOCH FROM ($2::time - hora_apertura))::int / 60 AS minutos_desde_apertura
       FROM instalacion WHERE id = $1 AND activa`,
      [instalacion_id, hora_inicio],
    );
    if (!inst.length) throw errores.noEncontrado('Instalación no encontrada');
    const instalacion = inst[0];
    if (instalacion.minutos_desde_apertura < 0
        || instalacion.minutos_desde_apertura % instalacion.duracion_bloque_min !== 0) {
      throw errores.noProcesable('La hora elegida no corresponde a una franja de esta instalación', 'FRANJA_INVALIDA');
    }

    const monto = Number((instalacion.tarifa_hora * instalacion.duracion_bloque_min / 60).toFixed(2));

    // --- Inserción: la BD valida horario, mantenimiento, aforo y solapamiento
    const { rows } = await cliente.query(
      `INSERT INTO reserva (socio_id, instalacion_id, periodo, estado, monto)
       VALUES ($1, $2,
               tstzrange(($3::date + $4::time) AT TIME ZONE 'America/Lima',
                         ($3::date + $4::time + make_interval(mins => $5)) AT TIME ZONE 'America/Lima', '[)'),
               $6, $7)
       RETURNING id, estado, monto, lower(periodo) AS inicio, upper(periodo) AS fin`,
      [usuario.socioId, instalacion.id, fecha, hora_inicio, instalacion.duracion_bloque_min,
        monto > 0 ? 'PENDIENTE' : 'CONFIRMADA', monto],
    );
    const reserva = rows[0];

    if (reserva.inicio <= new Date()) {
      throw errores.noProcesable('Esa franja ya empezó o pasó', 'FECHA_PASADA');
    }

    // --- Reservas con tarifa: se genera la cuota que el socio paga desde la app
    let cuota = null;
    if (monto > 0) {
      const { rows: c } = await cliente.query(
        `INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_vencimiento, reserva_id)
         VALUES ($1, 'RESERVA', date_trunc('month', $2::date), $3, $4, $2::date, $5)
         RETURNING id, monto, fecha_vencimiento`,
        [socio.titular_id, fecha, `Reserva ${instalacion.nombre} ${fecha} ${hora_inicio}`, monto, reserva.id],
      );
      cuota = c[0];
    }

    return {
      ...reserva,
      instalacion: instalacion.nombre,
      cuota,
      mensaje: cuota
        ? `Reserva separada. Paga S/ ${monto.toFixed(2)} en los próximos ${config.reservaPendienteMinutos} minutos para confirmarla`
        : 'Reserva confirmada',
    };
  });
}

async function misReservas(socioId, soloVigentes) {
  const { rows } = await db.query(
    `SELECT r.id, r.estado, r.monto, r.creada_en,
            lower(r.periodo) AS inicio, upper(r.periodo) AS fin,
            to_char(lower(r.periodo) AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS fecha,
            to_char(lower(r.periodo) AT TIME ZONE 'America/Lima', 'HH24:MI')    AS hora_inicio,
            to_char(upper(r.periodo) AT TIME ZONE 'America/Lima', 'HH24:MI')    AS hora_fin,
            i.id AS instalacion_id, i.nombre AS instalacion, i.tipo,
            c.id AS cuota_id, vs.saldo AS saldo_pendiente
     FROM reserva r
     JOIN instalacion i ON i.id = r.instalacion_id
     LEFT JOIN cuota c ON c.reserva_id = r.id AND NOT c.anulada
     LEFT JOIN v_saldo_cuota vs ON vs.cuota_id = c.id
     WHERE r.socio_id = $1
       AND ($2::boolean IS FALSE OR (upper(r.periodo) > now() AND r.estado IN ('PENDIENTE', 'CONFIRMADA')))
     ORDER BY lower(r.periodo) ${soloVigentes ? 'ASC' : 'DESC'}
     LIMIT 50`,
    [socioId, soloVigentes],
  );
  return rows;
}

/** Cancela una reserva futura. Si la cuota no se pagó, se anula. */
async function cancelar(usuario, reservaId) {
  return db.enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT r.id, r.socio_id, r.estado, lower(r.periodo) AS inicio
       FROM reserva r WHERE r.id = $1 FOR UPDATE`,
      [reservaId],
    );
    const reserva = rows[0];
    const esAdmin = usuario.rol === 'ADMIN';
    if (!reserva || (!esAdmin && reserva.socio_id !== usuario.socioId)) {
      throw errores.noEncontrado('Reserva no encontrada');
    }
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado)) {
      throw errores.conflicto(`La reserva ya está ${reserva.estado.toLowerCase()}`, 'RESERVA_NO_CANCELABLE');
    }
    if (reserva.inicio <= new Date()) {
      throw errores.conflicto('No se puede cancelar una reserva que ya empezó', 'RESERVA_NO_CANCELABLE');
    }

    await cliente.query(
      "UPDATE reserva SET estado = 'CANCELADA', cancelada_en = now() WHERE id = $1",
      [reservaId],
    );
    const { rows: anuladas } = await cliente.query(
      `UPDATE cuota c SET anulada = TRUE
       WHERE c.reserva_id = $1 AND NOT c.anulada
         AND NOT EXISTS (SELECT 1 FROM pago p WHERE p.cuota_id = c.id AND p.estado = 'APROBADO')
       RETURNING id`,
      [reservaId],
    );

    // Si había cuota y no se anuló es porque ya estaba pagada
    const { rows: pagadas } = await cliente.query(
      'SELECT 1 FROM cuota WHERE reserva_id = $1 AND NOT anulada',
      [reservaId],
    );

    return {
      id: reservaId,
      estado: 'CANCELADA',
      cuota_anulada: anuladas.length > 0,
      mensaje: pagadas.length
        ? 'Reserva cancelada. El reembolso de tu pago se coordina en administración'
        : 'Reserva cancelada',
    };
  });
}

/** Reservas de un día para el panel administrativo. */
async function reservasDelDia(fecha) {
  const { rows } = await db.query(
    `SELECT r.id, r.estado, r.monto,
            to_char(lower(r.periodo) AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora_inicio,
            to_char(upper(r.periodo) AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora_fin,
            i.nombre AS instalacion, s.numero_socio, s.nombres || ' ' || s.apellidos AS socio
     FROM reserva r
     JOIN instalacion i ON i.id = r.instalacion_id
     JOIN socio s ON s.id = r.socio_id
     WHERE lower(r.periodo) >= ($1::date)::timestamp AT TIME ZONE 'America/Lima'
       AND lower(r.periodo) <  ($1::date + 1)::timestamp AT TIME ZONE 'America/Lima'
     ORDER BY i.nombre, lower(r.periodo)`,
    [fecha],
  );
  return rows;
}

async function crearBloqueo(usuarioId, { instalacion_id, desde, hasta, motivo }) {
  const { rows } = await db.query(
    `INSERT INTO bloqueo_instalacion (instalacion_id, periodo, motivo, creado_por)
     VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4, $5)
     RETURNING id, lower(periodo) AS desde, upper(periodo) AS hasta, motivo`,
    [instalacion_id, desde, hasta, motivo, usuarioId],
  );
  return rows[0];
}

module.exports = {
  listarInstalaciones, disponibilidad, crearReserva, misReservas, cancelar, reservasDelDia, crearBloqueo,
};
