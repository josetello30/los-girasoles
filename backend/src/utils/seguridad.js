/**
 * Utilidades criptográficas: hashes, tokens aleatorios y comparación segura.
 */
'use strict';

const crypto = require('node:crypto');

/** SHA-256 en hexadecimal (mismo formato que digest() de pgcrypto). */
function sha256(texto) {
  return crypto.createHash('sha256').update(String(texto)).digest('hex');
}

/** Token aleatorio criptográficamente seguro, apto para URL y QR. */
function tokenAleatorio(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Compara dos cadenas en tiempo constante (evita ataques de temporización). */
function igualesSeguro(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { sha256, tokenAleatorio, igualesSeguro };
