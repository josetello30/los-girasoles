/**
 * Manejo centralizado de errores: toda respuesta de error tiene la forma
 *   { error: { codigo, mensaje, detalles? } }
 */
'use strict';

const { ErrorApi, errores, desdePostgres } = require('../utils/errores');
const config = require('../config/env');

function rutaNoEncontrada(req, _res, next) {
  next(errores.noEncontrado(`No existe la ruta ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, _next) {
  let error = err instanceof ErrorApi ? err : desdePostgres(err);

  // JSON mal formado en el cuerpo
  if (!error && err.type === 'entity.parse.failed') {
    error = errores.solicitudInvalida('El cuerpo de la solicitud no es un JSON válido');
  }

  // Cuerpo mayor al límite de express.json (100 KB): es un error del cliente, no del servidor
  if (!error && err.type === 'entity.too.large') {
    error = new ErrorApi(413, 'SOLICITUD_DEMASIADO_GRANDE', 'La solicitud supera el tamaño máximo permitido (100 KB)');
  }

  if (!error) {
    // Error no previsto: se registra completo, pero al cliente no se le filtran detalles internos.
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    error = new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado, inténtalo nuevamente');
    if (!config.esProduccion) error.detalles = { causa: err.message };
  }

  res.status(error.estado).json({
    error: {
      codigo: error.codigo,
      mensaje: error.message,
      ...(error.detalles ? { detalles: error.detalles } : {}),
    },
  });
}

module.exports = { rutaNoEncontrada, manejadorErrores };
