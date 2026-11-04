/**
 * Configuración centralizada a partir de variables de entorno.
 * Falla al arrancar si falta algo crítico: es mejor no levantar
 * que levantar con una configuración insegura.
 */
'use strict';

function requerida(nombre, valorPorDefecto) {
  const valor = process.env[nombre] ?? valorPorDefecto;
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno obligatoria: ${nombre}`);
  }
  return valor;
}

const entorno = process.env.NODE_ENV || 'development';

const config = {
  entorno,
  esProduccion: entorno === 'production',
  puerto: Number(process.env.PORT || 3000),

  db: {
    host: requerida('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT || 5432),
    database: requerida('DB_NAME', 'girasoles'),
    user: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
    max: Number(process.env.DB_POOL_MAX || 10),
  },

  jwt: {
    secreto: requerida('JWT_SECRET'),
    expiraEn: process.env.JWT_EXPIRA || '8h',
  },

  // Orígenes permitidos para CORS separados por coma ('*' = cualquiera, solo desarrollo)
  corsOrigenes: (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim()),

  // Minutos que una reserva con tarifa puede quedar PENDIENTE de pago antes de liberarse
  reservaPendienteMinutos: Number(process.env.RESERVA_PENDIENTE_MINUTOS || 30),

  // Ejecutar tareas programadas (emisión de cuotas, cierre de reservas). Se apaga en pruebas.
  tareasActivas: process.env.TAREAS_ACTIVAS !== 'false',

  // Saltos de proxy inverso en los que se confía para leer la IP real (X-Forwarded-For).
  // 0 = ninguno: la API se expone directo (Docker Compose). Si se pone detrás de Nginx, usar 1.
  // Confiar sin tener proxy permitiría saltarse el límite de intentos falsificando la cabecera.
  proxiesConfiables: Number(process.env.TRUST_PROXY || 0),

  zonaHoraria: 'America/Lima',
};

if (config.esProduccion && config.jwt.secreto.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
}

module.exports = config;
