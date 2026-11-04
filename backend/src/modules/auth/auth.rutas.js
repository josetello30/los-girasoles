/**
 * Rutas: /api/v1/auth
 */
'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { validar, z } = require('../../middlewares/validar');
const { autenticar } = require('../../middlewares/auth');
const servicio = require('./auth.servicio');

const router = Router();

// Freno contra fuerza bruta: 10 intentos fallidos por IP cada 15 minutos.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Espera 15 minutos.' } },
});

const esquemaLogin = z.object({
  login: z.string().min(1, 'Ingresa tu número de socio o usuario').max(40),
  password: z.string().min(1, 'Ingresa tu contraseña').max(100),
});

/** POST /auth/login  -> { token, usuario } */
router.post('/login', limiteLogin, validar({ body: esquemaLogin }), async (req, res) => {
  const { login, password } = req.valido.body;
  res.json(await servicio.iniciarSesion(login, password));
});

/** GET /auth/yo  -> perfil del usuario autenticado */
router.get('/yo', autenticar, async (req, res) => {
  res.json(await servicio.perfil(req.usuario.id));
});

module.exports = router;
