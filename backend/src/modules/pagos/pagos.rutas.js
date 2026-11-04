/**
 * Rutas: /api/v1/pagos
 */
'use strict';

const { Router } = require('express');
const { validar, z, uuid } = require('../../middlewares/validar');
const { requiereRol, soloSocio } = require('../../middlewares/auth');
const servicio = require('./pagos.servicio');

const router = Router();

/** GET /pagos/estado-cuenta -> estado de cuenta de la familia del socio */
router.get('/estado-cuenta', soloSocio, async (req, res) => {
  res.json(await servicio.estadoCuenta(req.usuario.titularId));
});

/** GET /pagos/historial -> comprobantes de pago */
router.get('/historial', soloSocio, async (req, res) => {
  res.json(await servicio.historialPagos(req.usuario.titularId));
});

const esquemaPagoEnLinea = z.discriminatedUnion('metodo', [
  z.object({
    cuota_id: uuid,
    metodo: z.literal('TARJETA'),
    tarjeta: z.object({
      numero: z.string().min(12).max(23),
      vencimiento: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Formato MM/AA'),
      cvv: z.string().regex(/^\d{3,4}$/, 'CVV inválido'),
      titular: z.string().trim().min(3).max(60),
    }),
  }),
  z.object({
    cuota_id: uuid,
    metodo: z.literal('YAPE_PLIN'),
    billetera: z.object({
      celular: z.string(),
      codigo_aprobacion: z.string(),
    }),
  }),
]);

/** POST /pagos -> pago en línea con la pasarela simulada */
router.post('/', soloSocio, validar({ body: esquemaPagoEnLinea }), async (req, res) => {
  res.status(201).json(await servicio.pagarEnLinea(req.usuario, req.valido.body));
});

/** POST /pagos/ventanilla -> pago presencial registrado por administración */
router.post(
  '/ventanilla',
  requiereRol('ADMIN'),
  validar({
    body: z.object({
      cuota_id: uuid,
      monto: z.number().positive().multipleOf(0.01).optional(),
      metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'YAPE_PLIN']),
      referencia: z.string().trim().max(60).optional(),
    }),
  }),
  async (req, res) => {
    res.status(201).json(await servicio.registrarEnVentanilla(req.usuario.id, req.valido.body));
  },
);

/** POST /pagos/:id/anular */
router.post('/:id/anular', requiereRol('ADMIN'), validar({ params: z.object({ id: uuid }) }), async (req, res) => {
  res.json(await servicio.anular(req.valido.params.id));
});

/** GET /pagos/socio/:titularId/estado-cuenta -> mismo estado de cuenta, para administración */
router.get(
  '/socio/:titularId/estado-cuenta',
  requiereRol('ADMIN'),
  validar({ params: z.object({ titularId: uuid }) }),
  async (req, res) => {
    res.json(await servicio.estadoCuenta(req.valido.params.titularId));
  },
);

module.exports = router;
