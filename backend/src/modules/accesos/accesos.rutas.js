/**
 * Rutas: /api/v1/accesos
 *
 * Dos formas de autenticarse:
 *   - Garita IoT (ESP32): cabecera X-Device-Key      -> POST /accesos/validar
 *   - Guardia con la app/panel: token JWT (GUARDIA)  -> POST /accesos/validar-guardia
 */
'use strict';

const { Router } = require('express');
const { validar, z } = require('../../middlewares/validar');
const { autenticar, requiereRol, soloSocio } = require('../../middlewares/auth');
const { autenticarDispositivo } = require('../../middlewares/dispositivo');
const servicio = require('./accesos.servicio');

const router = Router();

const cuerpoValidacion = z.object({
  metodo: z.enum(['RFID', 'QR']).default('RFID'),
  // Compatibilidad con el firmware: acepta 'uid' (RFID) o 'credencial' (cualquiera)
  uid: z.string().trim().regex(/^[0-9A-Fa-f]{8,20}$/, 'UID hexadecimal inválido').optional(),
  credencial: z.string().trim().min(4).max(200).optional(),
  direccion: z.enum(['ENTRADA', 'SALIDA']).default('ENTRADA'),
}).refine((b) => b.uid || b.credencial, { message: 'Envía "uid" o "credencial"' });

/**
 * POST /accesos/validar   (garita ESP32, cabecera X-Device-Key)
 * 200 -> permitido | 403 -> denegado. En ambos casos el cuerpo trae 'mensaje' para el LCD.
 */
router.post('/validar', autenticarDispositivo, validar({ body: cuerpoValidacion }), async (req, res) => {
  const { metodo, uid, credencial, direccion } = req.valido.body;
  const resultado = await servicio.validar({
    punto: req.dispositivo, metodo, credencial: uid || credencial, direccion,
  });
  res.status(resultado.permitido ? 200 : 403).json(resultado);
});

/** POST /accesos/validar-guardia  (guardia escanea el QR con su celular) */
router.post(
  '/validar-guardia',
  autenticar,
  requiereRol('GUARDIA', 'ADMIN'),
  validar({ body: cuerpoValidacion.and(z.object({ punto_acceso: z.string().default('GARITA-PRINCIPAL') })) }),
  async (req, res) => {
    const { metodo, uid, credencial, direccion, punto_acceso } = req.valido.body;
    const punto = await servicio.puntoPorCodigo(punto_acceso);
    const resultado = await servicio.validar({ punto, metodo, credencial: uid || credencial, direccion });
    res.status(resultado.permitido ? 200 : 403).json(resultado);
  },
);

/** POST /accesos/qr -> el socio genera su QR dinámico (válido 5 min, un solo uso) */
router.post('/qr', autenticar, soloSocio, async (req, res) => {
  res.status(201).json(await servicio.generarQrSocio(req.usuario.socioId));
});

/** GET /accesos/recientes?limite=50&resultado=DENEGADO -> registro en vivo */
router.get(
  '/recientes',
  autenticar,
  requiereRol('ADMIN', 'GUARDIA'),
  validar({
    query: z.object({
      limite: z.coerce.number().int().min(1).max(200).default(50),
      resultado: z.enum(['PERMITIDO', 'DENEGADO']).optional(),
      tipo_persona: z.enum(['SOCIO', 'TRABAJADOR', 'INVITADO', 'DESCONOCIDO']).optional(),
      punto: z.string().max(30).optional(),
    }),
  }),
  async (req, res) => {
    res.json(await servicio.recientes(req.valido.query));
  },
);

module.exports = router;
