/**
 * Registro de cada solicitud: método, ruta, estado y duración.
 * No registra cuerpos (podrían contener contraseñas o tokens).
 */
'use strict';

function registrarSolicitudes(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const quien = req.usuario?.login || req.dispositivo?.codigo || '-';
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms ${quien}`);
  });
  next();
}

module.exports = { registrarSolicitudes };
