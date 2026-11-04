/**
 * Consulta y administración de socios y sus tarjetas RFID.
 */
'use strict';

const db = require('../../db');
const { errores } = require('../../utils/errores');

/** Titular y dependientes de la familia de un socio. */
async function familia(titularId) {
  const { rows } = await db.query(
    `SELECT socio_id, numero_socio, tipo, parentesco, nombres, apellidos, dni, estado_socio
     FROM v_socio_detalle
     WHERE titular_id = $1
     ORDER BY tipo DESC, numero_socio`,
    [titularId],
  );
  return rows;
}

/** Listado paginado para el panel administrativo. */
async function listar({ q, tipo, estado_pago, estado_socio, pagina, limite }) {
  const condiciones = [];
  const valores = [];
  // Agrega un valor parametrizado y devuelve su marcador ($n)
  const param = (valor) => {
    valores.push(valor);
    return `$${valores.length}`;
  };

  if (q) {
    const p = param(`%${q}%`);
    condiciones.push(`(numero_socio ILIKE ${p} OR dni ILIKE ${p} OR (nombres || ' ' || apellidos) ILIKE ${p})`);
  }
  if (tipo) condiciones.push(`tipo = ${param(tipo)}`);
  if (estado_pago) condiciones.push(`estado_pago = ${param(estado_pago)}`);
  if (estado_socio) condiciones.push(`estado_socio = ${param(estado_socio)}`);

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  valores.push(limite, (pagina - 1) * limite);
  const { rows } = await db.query(
    `SELECT socio_id, numero_socio, tipo, parentesco, nombres, apellidos, dni, lote,
            estado_socio, estado_pago, deuda_total, deuda_vencida, dias_mora_max,
            count(*) OVER () AS total
     FROM v_socio_detalle
     ${where}
     ORDER BY numero_socio
     LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  );

  return {
    datos: rows.map(({ total, ...resto }) => resto),
    total: rows[0]?.total ?? 0,
    pagina,
    limite,
  };
}

async function detalle(socioId) {
  const { rows } = await db.query('SELECT * FROM v_socio_detalle WHERE socio_id = $1', [socioId]);
  if (!rows.length) throw errores.noEncontrado('Socio no encontrado');
  const socio = rows[0];
  const [fam, tarjetas] = await Promise.all([familia(socio.titular_id), credenciales(socioId)]);
  return { ...socio, familia: fam, credenciales: tarjetas };
}

async function cambiarEstado(socioId, estado) {
  const { rows } = await db.query(
    'UPDATE socio SET estado = $2 WHERE id = $1 RETURNING id, numero_socio, estado',
    [socioId, estado],
  );
  if (!rows.length) throw errores.noEncontrado('Socio no encontrado');
  return rows[0];
}

async function credenciales(socioId) {
  const { rows } = await db.query(
    `SELECT id, uid_tarjeta, estado, emitida_en, revocada_en
     FROM credencial_rfid WHERE socio_id = $1 ORDER BY emitida_en DESC`,
    [socioId],
  );
  return rows;
}

/**
 * Bloquea una tarjeta (perdida o revocada). Si se indica socioId,
 * solo puede bloquear sus propias tarjetas (uso desde la app).
 */
async function bloquearCredencial(credencialId, estado, socioId = null) {
  const { rows } = await db.query(
    `UPDATE credencial_rfid
     SET estado = $2, revocada_en = now()
     WHERE id = $1 AND estado = 'ACTIVA' AND ($3::uuid IS NULL OR socio_id = $3)
     RETURNING id, uid_tarjeta, estado, revocada_en`,
    [credencialId, estado, socioId],
  );
  if (!rows.length) throw errores.noEncontrado('Tarjeta no encontrada o ya bloqueada');
  return rows[0];
}

module.exports = { familia, listar, detalle, cambiarEstado, credenciales, bloquearCredencial };
