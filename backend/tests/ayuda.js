/**
 * Utilidades compartidas por las pruebas de la API.
 * Las pruebas usan la BD de desarrollo con los datos de la semilla:
 * crean registros nuevos (reservas, pagos, accesos) que `make reset` limpia.
 */
'use strict';

const request = require('supertest');
const { crearApp } = require('../src/app');
const db = require('../src/db');
const { hoyLima, sumarDias } = require('../src/utils/tiempo');

const app = crearApp();
const API = '/api/v1';
const CLAVE_GARITA = 'gir-dev-garita-principal-2026';
const PASSWORD_SOCIOS = 'Girasoles2026';

async function login(usuario, password = PASSWORD_SOCIOS) {
  const res = await request(app).post(`${API}/auth/login`).send({ login: usuario, password });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${usuario}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

/** Cliente HTTP autenticado: api(token).get('/ruta') */
function api(token) {
  const conToken = (r) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (ruta) => conToken(request(app).get(API + ruta)),
    post: (ruta, cuerpo) => conToken(request(app).post(API + ruta)).send(cuerpo),
    patch: (ruta, cuerpo) => conToken(request(app).patch(API + ruta)).send(cuerpo),
    delete: (ruta) => conToken(request(app).delete(API + ruta)),
  };
}

/** Garita autenticada con su API key. */
function garita(cuerpo, clave = CLAVE_GARITA) {
  const r = request(app).post(`${API}/accesos/validar`);
  if (clave) r.set('X-Device-Key', clave);
  return r.send(cuerpo);
}

/**
 * Busca un titular al día, activo y sin reservas vigentes, para que las pruebas
 * no dependan de qué generó la semilla. `saltar` permite pedir uno distinto.
 */
async function socioLibre(saltar = 0) {
  const { rows } = await db.query(
    `SELECT sd.numero_socio, sd.socio_id, sd.titular_id
     FROM v_socio_detalle sd
     JOIN socio s ON s.id = sd.socio_id
     WHERE sd.tipo = 'TITULAR' AND sd.estado_socio = 'ACTIVO' AND sd.estado_pago = 'AL_DIA'
       AND s.usuario_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM reserva r WHERE r.socio_id = sd.socio_id
                        AND r.estado IN ('PENDIENTE','CONFIRMADA') AND upper(r.periodo) > now())
     ORDER BY sd.numero_socio DESC
     OFFSET $1 LIMIT 1`,
    [saltar],
  );
  return rows[0];
}

async function instalacion(codigo) {
  const { rows } = await db.query('SELECT id, tarifa_hora FROM instalacion WHERE codigo = $1', [codigo]);
  return rows[0];
}

/** Primera franja libre de una instalación entre los próximos días. */
async function franjaLibre(token, codigo, desdeDias = 3) {
  const inst = await instalacion(codigo);
  for (let d = desdeDias; d <= 13; d += 1) {
    const fecha = sumarDias(hoyLima(), d);
    const res = await api(token).get(`/instalaciones/${inst.id}/disponibilidad?fecha=${fecha}`);
    const libre = res.body.franjas.find((f) => f.disponible);
    if (libre) return { instalacion_id: inst.id, fecha, hora_inicio: libre.hora_inicio };
  }
  throw new Error(`Sin franjas libres para ${codigo}`);
}

module.exports = {
  app, db, API, login, api, garita, socioLibre, instalacion, franjaLibre,
  hoyLima, sumarDias, CLAVE_GARITA, PASSWORD_SOCIOS,
};
