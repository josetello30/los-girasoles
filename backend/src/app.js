/**
 * Construcción de la aplicación Express (sin abrir el puerto: así las pruebas
 * pueden usarla directamente con supertest).
 */
'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');
const db = require('./db');
const { autenticar, requiereRol } = require('./middlewares/auth');
const { registrarSolicitudes } = require('./middlewares/registro');
const { rutaNoEncontrada, manejadorErrores } = require('./middlewares/errores');

const authRutas = require('./modules/auth/auth.rutas');
const sociosRutas = require('./modules/socios/socios.rutas');
const { instalaciones, reservas } = require('./modules/reservas/reservas.rutas');
const pagosRutas = require('./modules/pagos/pagos.rutas');
const accesosRutas = require('./modules/accesos/accesos.rutas');
const invitadosRutas = require('./modules/invitados/invitados.rutas');
const { noticias, eventos, servicios } = require('./modules/comunicacion/comunicacion.rutas');
const tiendaRutas = require('./modules/tienda/tienda.rutas');
const nominaRutas = require('./modules/nomina/nomina.rutas');

function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.proxiesConfiables); // ver TRUST_PROXY en config/env.js
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigenes.includes('*') ? true : config.corsOrigenes,
  }));
  app.use(express.json({ limit: '100kb' }));
  if (config.entorno !== 'test') app.use(registrarSolicitudes);

  const v1 = express.Router();

  // ---------------- Rutas públicas o con autenticación propia
  /** GET /health -> estado del servicio y de la BD (lo usa el healthcheck de Docker) */
  v1.get('/health', async (_req, res) => {
    const inicio = Date.now();
    try {
      await db.query('SELECT 1');
      res.json({ estado: 'ok', base_de_datos: 'ok', latencia_bd_ms: Date.now() - inicio, hora: new Date() });
    } catch {
      res.status(503).json({ estado: 'degradado', base_de_datos: 'sin conexión' });
    }
  });
  v1.use('/auth', authRutas);
  v1.use('/accesos', accesosRutas); // garita (API key) y QR (JWT) se autentican dentro

  // ---------------- A partir de aquí todo requiere sesión
  v1.use(autenticar);
  v1.use('/socios', sociosRutas);
  v1.use('/instalaciones', instalaciones);
  v1.use('/reservas', reservas);
  v1.use('/pagos', pagosRutas);
  v1.use('/invitados', invitadosRutas);
  v1.use('/noticias', noticias);
  v1.use('/eventos', eventos);
  v1.use('/servicios', servicios);
  v1.use('/tienda', tiendaRutas);
  v1.use('/nomina', requiereRol('ADMIN'), nominaRutas);

  app.use('/api/v1', v1);
  app.get('/', (_req, res) => res.json({
    servicio: 'API Club Residencial Los Girasoles de Huampaní',
    version: '1.0.0',
    documentacion: 'https://github.com/josetello30/los-girasoles/blob/main/docs/API.md',
  }));

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
