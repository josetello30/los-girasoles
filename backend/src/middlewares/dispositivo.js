/**
 * Autenticación de dispositivos IoT (garitas ESP32) mediante API key.
 * El dispositivo envía 'X-Device-Key: <clave>'; en la BD solo existe su SHA-256.
 * Se cachea por 60 s para no consultar la BD en cada lectura de tarjeta (RNF02).
 */
'use strict';

const db = require('../db');
const { errores } = require('../utils/errores');
const { sha256 } = require('../utils/seguridad');

const CACHE_MS = 60 * 1000;
const cache = new Map(); // hash -> { punto, expira }

async function buscarPunto(hash) {
  const enCache = cache.get(hash);
  if (enCache && enCache.expira > Date.now()) return enCache.punto;

  const { rows } = await db.query(
    `SELECT id, codigo, nombre, tipo FROM punto_acceso
     WHERE api_key_hash = $1 AND activo`,
    [hash],
  );
  const punto = rows[0] || null;
  cache.set(hash, { punto, expira: Date.now() + CACHE_MS });
  return punto;
}

async function autenticarDispositivo(req, _res, next) {
  const clave = req.get('x-device-key');
  if (!clave) return next(errores.noAutenticado('Falta la cabecera X-Device-Key'));

  try {
    const punto = await buscarPunto(sha256(clave));
    if (!punto) return next(errores.noAutenticado('Dispositivo no autorizado'));
    req.dispositivo = punto;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Limpia la caché (útil en pruebas o al desactivar una garita). */
function limpiarCacheDispositivos() {
  cache.clear();
}

module.exports = { autenticarDispositivo, limpiarCacheDispositivos };
