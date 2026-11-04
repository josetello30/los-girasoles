/**
 * Tareas programadas del backend (sin dependencias externas de cron).
 *
 *  - Emisión de cuotas de mantenimiento del mes (idempotente).
 *  - Reservas CONFIRMADAS que ya terminaron -> COMPLETADA.
 *  - Reservas PENDIENTES de pago por más de N minutos -> CANCELADA (libera la franja).
 *
 * Un candado consultivo de PostgreSQL evita que dos réplicas del backend
 * ejecuten la misma tarea a la vez.
 */
'use strict';

const db = require('../db');
const config = require('../config/env');

const INTERVALO_MS = 5 * 60 * 1000;
const ID_CANDADO = 20260101; // número arbitrario y fijo para este proceso
let temporizador = null;

async function ejecutarTareas() {
  const cliente = await db.pool.connect();
  try {
    const { rows } = await cliente.query('SELECT pg_try_advisory_lock($1) AS ok', [ID_CANDADO]);
    if (!rows[0].ok) return; // otra instancia ya las está ejecutando

    const emitidas = await cliente.query('SELECT fn_emitir_cuotas_mantenimiento(CURRENT_DATE) AS n');

    const completadas = await cliente.query(
      `UPDATE reserva SET estado = 'COMPLETADA'
       WHERE estado = 'CONFIRMADA' AND upper(periodo) <= now()`,
    );

    // Libera reservas impagas: la cuota se anula y la franja vuelve a estar disponible
    const liberadas = await cliente.query(
      `WITH vencidas AS (
          SELECT r.id FROM reserva r
          WHERE r.estado = 'PENDIENTE'
            AND r.creada_en < now() - make_interval(mins => $1)
            AND NOT EXISTS (SELECT 1 FROM cuota c JOIN pago p ON p.cuota_id = c.id
                            WHERE c.reserva_id = r.id AND p.estado = 'APROBADO')
       ),
       canceladas AS (
          UPDATE reserva SET estado = 'CANCELADA', cancelada_en = now()
          WHERE id IN (SELECT id FROM vencidas) RETURNING id
       )
       UPDATE cuota SET anulada = TRUE
       WHERE reserva_id IN (SELECT id FROM canceladas) AND NOT anulada
       RETURNING reserva_id`,
      [config.reservaPendienteMinutos],
    );

    const n = emitidas.rows[0].n + completadas.rowCount + liberadas.rowCount;
    if (n > 0) {
      console.log(`[tareas] cuotas emitidas: ${emitidas.rows[0].n} | reservas completadas: ${completadas.rowCount}`
        + ` | reservas impagas liberadas: ${liberadas.rowCount}`);
    }
  } catch (err) {
    console.error('[tareas] Error ejecutando tareas programadas:', err.message);
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [ID_CANDADO]).catch(() => {});
    cliente.release();
  }
}

function iniciarTareas() {
  if (!config.tareasActivas || temporizador) return;
  ejecutarTareas();
  temporizador = setInterval(ejecutarTareas, INTERVALO_MS);
  temporizador.unref(); // no impide que el proceso termine
}

function detenerTareas() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

module.exports = { iniciarTareas, detenerTareas, ejecutarTareas };
