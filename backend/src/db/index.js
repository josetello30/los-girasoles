/**
 * Acceso a PostgreSQL: pool de conexiones y helper de transacciones.
 * Toda consulta usa parámetros ($1, $2...) para evitar inyección SQL.
 */
'use strict';

const { Pool, types } = require('pg');
const config = require('../config/env');

// NUMERIC (montos) llega como texto por precisión; en este dominio (soles con
// 2 decimales) es seguro convertirlo a número para el JSON de la API.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// BIGINT (count(*)) a número entero.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// DATE se mantiene como 'YYYY-MM-DD' para no sufrir desfases de zona horaria.
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  ...config.db,
  application_name: 'girasoles-backend',
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Cada conexión opera en hora de Lima, igual que la BD.
  options: `-c timezone=${config.zonaHoraria}`,
});

pool.on('error', (err) => {
  // Error en una conexión inactiva (ej. la BD se reinició). El pool la descarta solo.
  console.error('[db] Error en conexión inactiva:', err.message);
});

/** Ejecuta una consulta con el pool. */
function query(texto, parametros) {
  return pool.query(texto, parametros);
}

/**
 * Ejecuta `fn(cliente)` dentro de una transacción.
 * Si fn lanza un error se hace ROLLBACK y el error se propaga.
 */
async function enTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/** Lee un parámetro de negocio de la tabla 'parametro'. */
async function parametro(clave, cliente = pool) {
  const { rows } = await cliente.query('SELECT valor FROM parametro WHERE clave = $1', [clave]);
  if (!rows.length) throw new Error(`Parámetro inexistente: ${clave}`);
  return rows[0].valor;
}

async function cerrar() {
  await pool.end();
}

module.exports = { pool, query, enTransaccion, parametro, cerrar };
