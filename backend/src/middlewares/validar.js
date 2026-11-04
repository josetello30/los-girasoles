/**
 * Validación de entrada con zod. Los datos ya validados y convertidos quedan
 * en req.valido.body / req.valido.query / req.valido.params.
 * (En Express 5 req.query es de solo lectura, por eso no se sobrescribe.)
 */
'use strict';

const { z } = require('zod');
const { errores } = require('../utils/errores');

function validar(esquemas) {
  return (req, _res, next) => {
    req.valido = req.valido || {};
    for (const parte of ['params', 'query', 'body']) {
      if (!esquemas[parte]) continue;
      const resultado = esquemas[parte].safeParse(req[parte] ?? {});
      if (!resultado.success) {
        const detalles = resultado.error.issues.map((i) => ({
          campo: i.path.join('.') || parte,
          mensaje: i.message,
        }));
        return next(errores.solicitudInvalida('Datos de entrada inválidos', detalles));
      }
      req.valido[parte] = resultado.data;
    }
    return next();
  };
}

// Piezas reutilizables
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: AAAA-MM-DD');
const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato esperado: HH:MM');
const uuid = z.string().uuid('Identificador inválido');
const paginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { validar, z, fechaIso, horaHHMM, uuid, paginacion };
