/**
 * Rutas: /api/v1/socios
 */
'use strict';

const { Router } = require('express');
const { validar, z, uuid, paginacion } = require('../../middlewares/validar');
const { requiereRol, soloSocio } = require('../../middlewares/auth');
const servicio = require('./socios.servicio');

const router = Router();

// ------------------------------------------------------------ socio (app)

/** GET /socios/yo/familia -> titular y dependientes */
router.get('/yo/familia', soloSocio, async (req, res) => {
  res.json(await servicio.familia(req.usuario.titularId));
});

/** GET /socios/yo/credenciales -> tarjetas RFID del socio */
router.get('/yo/credenciales', soloSocio, async (req, res) => {
  res.json(await servicio.credenciales(req.usuario.socioId));
});

/** POST /socios/yo/credenciales/:id/reportar-perdida -> bloquea la tarjeta al instante */
router.post(
  '/yo/credenciales/:id/reportar-perdida',
  soloSocio,
  validar({ params: z.object({ id: uuid }) }),
  async (req, res) => {
    res.json(await servicio.bloquearCredencial(req.valido.params.id, 'PERDIDA', req.usuario.socioId));
  },
);

// ------------------------------------------------------------ administración

const filtros = paginacion.extend({
  q: z.string().trim().max(60).optional(),
  tipo: z.enum(['TITULAR', 'DEPENDIENTE']).optional(),
  estado_pago: z.enum(['AL_DIA', 'PENDIENTE', 'VENCIDO']).optional(),
  estado_socio: z.enum(['ACTIVO', 'SUSPENDIDO', 'BAJA']).optional(),
});

/** GET /socios?q=&estado_pago=&pagina=&limite= */
router.get('/', requiereRol('ADMIN'), validar({ query: filtros }), async (req, res) => {
  res.json(await servicio.listar(req.valido.query));
});

/** GET /socios/:id -> ficha completa con familia y tarjetas */
router.get('/:id', requiereRol('ADMIN', 'GUARDIA'), validar({ params: z.object({ id: uuid }) }), async (req, res) => {
  res.json(await servicio.detalle(req.valido.params.id));
});

/** PATCH /socios/:id/estado { estado } */
router.patch(
  '/:id/estado',
  requiereRol('ADMIN'),
  validar({
    params: z.object({ id: uuid }),
    body: z.object({ estado: z.enum(['ACTIVO', 'SUSPENDIDO', 'BAJA']) }),
  }),
  async (req, res) => {
    res.json(await servicio.cambiarEstado(req.valido.params.id, req.valido.body.estado));
  },
);

/** PATCH /socios/credenciales/:id { estado: PERDIDA | REVOCADA } */
router.patch(
  '/credenciales/:id',
  requiereRol('ADMIN'),
  validar({
    params: z.object({ id: uuid }),
    body: z.object({ estado: z.enum(['PERDIDA', 'REVOCADA']) }),
  }),
  async (req, res) => {
    res.json(await servicio.bloquearCredencial(req.valido.params.id, req.valido.body.estado));
  },
);

module.exports = router;
