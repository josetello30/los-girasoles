/**
 * Estado de cuenta y pagos (cuotas de mantenimiento, reservas, tienda).
 */
'use strict';

const db = require('../../db');
const { errores, ErrorApi } = require('../../utils/errores');
const pasarela = require('./pasarela.simulada');

/** Estado de cuenta del titular: resumen, cuotas por pagar e historial. */
async function estadoCuenta(titularId) {
  const [resumen, porPagar, historial] = await Promise.all([
    db.query(
      `SELECT numero_socio, nombres, apellidos, lote, estado_pago, deuda_total, deuda_vencida,
              cuotas_vencidas, dias_mora_max
       FROM v_estado_cuenta WHERE socio_id = $1`,
      [titularId],
    ),
    db.query(
      `SELECT cuota_id, concepto, periodo, descripcion, monto, pagado, saldo,
              fecha_vencimiento, estado, dias_mora
       FROM v_saldo_cuota
       WHERE socio_id = $1 AND saldo > 0
       ORDER BY fecha_vencimiento`,
      [titularId],
    ),
    db.query(
      `SELECT v.cuota_id, v.periodo, v.descripcion, v.monto, v.saldo, v.fecha_vencimiento,
              v.estado, v.ultimo_pago
       FROM v_saldo_cuota v
       WHERE v.socio_id = $1 AND v.concepto = 'MANTENIMIENTO'
       ORDER BY v.periodo DESC
       LIMIT 12`,
      [titularId],
    ),
  ]);

  if (!resumen.rows.length) throw errores.noEncontrado('Estado de cuenta no encontrado');
  return {
    resumen: resumen.rows[0],
    cuota_mensual: Number(await db.parametro('cuota_mantenimiento_monto')),
    por_pagar: porPagar.rows,
    historial_mantenimiento: historial.rows,
  };
}

/** Pagos realizados por la familia (comprobantes). */
async function historialPagos(titularId, limite = 30) {
  const { rows } = await db.query(
    `SELECT p.id, p.monto, p.metodo, p.referencia, p.estado, p.pagado_en,
            c.concepto, c.descripcion
     FROM pago p JOIN cuota c ON c.id = p.cuota_id
     WHERE c.socio_id = $1
     ORDER BY p.pagado_en DESC
     LIMIT $2`,
    [titularId, limite],
  );
  return rows;
}

/** Efectos posteriores a cancelar completamente una cuota. */
async function aplicarEfectosDePago(cliente, cuota) {
  const { rows } = await cliente.query('SELECT saldo FROM v_saldo_cuota WHERE cuota_id = $1', [cuota.id]);
  if (rows[0]?.saldo > 0) return;

  if (cuota.reserva_id) {
    await cliente.query(
      "UPDATE reserva SET estado = 'CONFIRMADA' WHERE id = $1 AND estado = 'PENDIENTE'",
      [cuota.reserva_id],
    );
  }
  if (cuota.pedido_id) {
    await cliente.query(
      "UPDATE pedido SET estado = 'PAGADO' WHERE id = $1 AND estado = 'PENDIENTE_PAGO'",
      [cuota.pedido_id],
    );
  }
}

/** Bloquea la cuota y verifica que pertenezca al titular (si se indica) y tenga saldo. */
async function cuotaPagable(cliente, cuotaId, titularId = null) {
  const { rows } = await cliente.query(
    `SELECT c.id, c.socio_id, c.descripcion, c.reserva_id, c.pedido_id, c.anulada, c.monto,
            c.monto - COALESCE((SELECT sum(monto) FROM pago
                                WHERE cuota_id = c.id AND estado = 'APROBADO'), 0) AS saldo
     FROM cuota c WHERE c.id = $1 FOR UPDATE`,
    [cuotaId],
  );
  const cuota = rows[0];
  if (!cuota || (titularId && cuota.socio_id !== titularId)) throw errores.noEncontrado('Cuota no encontrada');
  if (cuota.anulada) throw errores.conflicto('Esta cuota fue anulada', 'CUOTA_ANULADA');
  if (cuota.saldo <= 0) throw errores.conflicto('Esta cuota ya está pagada', 'CUOTA_PAGADA');
  return cuota;
}

/**
 * Pago en línea desde la app (tarjeta o Yape/Plin) por el saldo total de la cuota.
 * Se paga el saldo completo: evita que el socio quede con montos "sueltos".
 */
async function pagarEnLinea(usuario, { cuota_id, metodo, tarjeta, billetera }) {
  return db.enTransaccion(async (cliente) => {
    const cuota = await cuotaPagable(cliente, cuota_id, usuario.titularId);

    const resultado = await pasarela.procesar({ metodo, tarjeta, billetera });
    if (!resultado.aprobado) {
      throw new ErrorApi(402, 'PAGO_RECHAZADO', `Pago rechazado: ${resultado.motivo}`);
    }

    const { rows } = await cliente.query(
      `INSERT INTO pago (cuota_id, monto, metodo, referencia)
       VALUES ($1, $2, $3, $4)
       RETURNING id, monto, metodo, referencia, estado, pagado_en`,
      [cuota.id, cuota.saldo, metodo, resultado.referencia],
    );
    await aplicarEfectosDePago(cliente, cuota);

    return {
      comprobante: { ...rows[0], concepto: cuota.descripcion, detalle: resultado.detalle },
      mensaje: 'Pago aprobado',
    };
  });
}

/** Pago registrado en ventanilla por un administrador (efectivo o transferencia). */
async function registrarEnVentanilla(adminId, { cuota_id, monto, metodo, referencia }) {
  return db.enTransaccion(async (cliente) => {
    const cuota = await cuotaPagable(cliente, cuota_id);
    const { rows } = await cliente.query(
      `INSERT INTO pago (cuota_id, monto, metodo, referencia, registrado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, monto, metodo, referencia, estado, pagado_en`,
      [cuota.id, monto ?? cuota.saldo, metodo, referencia || null, adminId],
    );
    await aplicarEfectosDePago(cliente, cuota);
    return rows[0];
  });
}

/** Anula un pago erróneo (los pagos nunca se borran: auditoría). */
async function anular(pagoId) {
  const { rows } = await db.query(
    `UPDATE pago SET estado = 'ANULADO'
     WHERE id = $1 AND estado = 'APROBADO'
     RETURNING id, monto, estado`,
    [pagoId],
  );
  if (!rows.length) throw errores.noEncontrado('Pago no encontrado o ya anulado');
  return rows[0];
}

module.exports = { estadoCuenta, historialPagos, pagarEnLinea, registrarEnVentanilla, anular };
