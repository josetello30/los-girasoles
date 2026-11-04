/**
 * Rutas: /api/v1/invitados
 * El socio registra a sus visitas y recibe un QR para compartirles por WhatsApp.
 */
'use strict';

const { Router } = require('express');
const db = require('../../db');
const { validar, z, fechaIso } = require('../../middlewares/validar');
const { soloSocio, requiereRol } = require('../../middlewares/auth');
const { errores } = require('../../utils/errores');
const { hoyLima, sumarDias, inicioMes } = require('../../utils/tiempo');
const accesos = require('../accesos/accesos.servicio');

const router = Router();

const esquemaInvitado = z.object({
  dni: z.string().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos'),
  nombres: z.string().trim().min(2).max(80),
  apellidos: z.string().trim().min(2).max(80),
  placa_vehiculo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/, 'Placa inválida').optional(),
  fecha_visita: fechaIso,
});

/** POST /invitados -> registra la visita y devuelve su QR */
router.post('/', soloSocio, validar({ body: esquemaInvitado }), async (req, res) => {
  const datos = req.valido.body;
  const hoy = hoyLima();
  if (datos.fecha_visita < hoy || datos.fecha_visita > sumarDias(hoy, 30)) {
    throw errores.noProcesable('La visita debe ser entre hoy y los próximos 30 días', 'FECHA_INVALIDA');
  }

  const resultado = await db.enTransaccion(async (cliente) => {
    // Límite mensual compartido por toda la familia del titular
    const maximo = Number(await db.parametro('invitados_max_mes', cliente));
    const { rows: conteo } = await cliente.query(
      `SELECT count(*) AS usados FROM invitado i
       JOIN socio s ON s.id = i.socio_anfitrion_id
       WHERE COALESCE(s.titular_id, s.id) = $1
         AND date_trunc('month', i.fecha_visita) = $2::date`,
      [req.usuario.titularId, inicioMes(datos.fecha_visita)],
    );
    if (conteo[0].usados >= maximo) {
      throw errores.conflicto(`Tu familia ya registró ${maximo} invitados este mes`, 'LIMITE_INVITADOS');
    }

    const { rows } = await cliente.query(
      `INSERT INTO invitado (socio_anfitrion_id, dni, nombres, apellidos, placa_vehiculo, fecha_visita)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, dni, nombres, apellidos, placa_vehiculo, fecha_visita`,
      [req.usuario.socioId, datos.dni, datos.nombres, datos.apellidos, datos.placa_vehiculo || null, datos.fecha_visita],
    );
    const qr = await accesos.generarQrInvitado(cliente, rows[0].id, datos.fecha_visita);
    return { ...rows[0], ...qr, invitados_restantes_mes: maximo - conteo[0].usados - 1 };
  });

  res.status(201).json(resultado);
});

/** GET /invitados/mios -> visitas registradas por el socio */
router.get('/mios', soloSocio, async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.id, i.dni, i.nombres, i.apellidos, i.placa_vehiculo, i.fecha_visita, i.creado_en,
            EXISTS (SELECT 1 FROM log_acceso l WHERE l.invitado_id = i.id AND l.resultado = 'PERMITIDO') AS ingreso
     FROM invitado i
     WHERE i.socio_anfitrion_id = $1
     ORDER BY i.fecha_visita DESC
     LIMIT 50`,
    [req.usuario.socioId],
  );
  res.json(rows);
});

/** GET /invitados?fecha= -> visitas esperadas del día (garita) */
router.get(
  '/',
  requiereRol('ADMIN', 'GUARDIA'),
  validar({ query: z.object({ fecha: fechaIso.optional() }) }),
  async (req, res) => {
    const { rows } = await db.query(
      `SELECT i.id, i.dni, i.nombres, i.apellidos, i.placa_vehiculo, i.fecha_visita,
              s.numero_socio, s.nombres || ' ' || s.apellidos AS anfitrion
       FROM invitado i JOIN socio s ON s.id = i.socio_anfitrion_id
       WHERE i.fecha_visita = $1
       ORDER BY i.apellidos`,
      [req.valido.query.fecha || hoyLima()],
    );
    res.json(rows);
  },
);

module.exports = router;
