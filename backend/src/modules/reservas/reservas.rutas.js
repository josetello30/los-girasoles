/**
 * Rutas: /api/v1/instalaciones y /api/v1/reservas
 */
'use strict';

const { Router } = require('express');
const { validar, z, uuid, fechaIso, horaHHMM } = require('../../middlewares/validar');
const { requiereRol, soloSocio } = require('../../middlewares/auth');
const { hoyLima } = require('../../utils/tiempo');
const servicio = require('./reservas.servicio');

// ------------------------------------------------------------ instalaciones
const instalaciones = Router();

/** GET /instalaciones?fecha=AAAA-MM-DD -> instalaciones con franjas libres del día */
instalaciones.get(
  '/',
  validar({ query: z.object({ fecha: fechaIso.optional() }) }),
  async (req, res) => {
    res.json(await servicio.listarInstalaciones(req.valido.query.fecha || hoyLima()));
  },
);

/** GET /instalaciones/:id/disponibilidad?fecha=AAAA-MM-DD -> franjas horarias */
instalaciones.get(
  '/:id/disponibilidad',
  validar({ params: z.object({ id: uuid }), query: z.object({ fecha: fechaIso.optional() }) }),
  async (req, res) => {
    res.json(await servicio.disponibilidad(req.valido.params.id, req.valido.query.fecha || hoyLima()));
  },
);

/** POST /instalaciones/:id/bloqueos -> cierre por mantenimiento o evento privado */
instalaciones.post(
  '/:id/bloqueos',
  requiereRol('ADMIN'),
  validar({
    params: z.object({ id: uuid }),
    body: z.object({
      desde: z.string().datetime({ offset: true }),
      hasta: z.string().datetime({ offset: true }),
      motivo: z.string().trim().min(3).max(120),
    }).refine((b) => new Date(b.hasta) > new Date(b.desde), { message: '"hasta" debe ser posterior a "desde"' }),
  }),
  async (req, res) => {
    const bloqueo = await servicio.crearBloqueo(req.usuario.id, { instalacion_id: req.valido.params.id, ...req.valido.body });
    res.status(201).json(bloqueo);
  },
);

// ------------------------------------------------------------ reservas
const reservas = Router();

/** POST /reservas { instalacion_id, fecha, hora_inicio } */
reservas.post(
  '/',
  soloSocio,
  validar({ body: z.object({ instalacion_id: uuid, fecha: fechaIso, hora_inicio: horaHHMM }) }),
  async (req, res) => {
    res.status(201).json(await servicio.crearReserva(req.usuario, req.valido.body));
  },
);

/** GET /reservas/mias?vigentes=true */
reservas.get(
  '/mias',
  soloSocio,
  validar({ query: z.object({ vigentes: z.enum(['true', 'false']).default('true') }) }),
  async (req, res) => {
    res.json(await servicio.misReservas(req.usuario.socioId, req.valido.query.vigentes === 'true'));
  },
);

/** DELETE /reservas/:id -> cancela (el socio las suyas, el admin cualquiera) */
reservas.delete('/:id', validar({ params: z.object({ id: uuid }) }), async (req, res) => {
  res.json(await servicio.cancelar(req.usuario, req.valido.params.id));
});

/** GET /reservas?fecha=AAAA-MM-DD -> agenda del día (administración) */
reservas.get(
  '/',
  requiereRol('ADMIN', 'GUARDIA'),
  validar({ query: z.object({ fecha: fechaIso.optional() }) }),
  async (req, res) => {
    res.json(await servicio.reservasDelDia(req.valido.query.fecha || hoyLima()));
  },
);

module.exports = { instalaciones, reservas };
