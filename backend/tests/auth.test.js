/**
 * Pruebas: inicio de sesión, sesión y autorización por rol.
 */
'use strict';

const { api, login, db } = require('./ayuda');

afterAll(() => db.cerrar());

describe('Autenticación', () => {
  test('A01 socio inicia sesión con su número de socio', async () => {
    const res = await api().post('/auth/login', { login: '00247', password: 'Girasoles2026' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.usuario).toMatchObject({ rol: 'SOCIO', numero_socio: '00247', nombres: 'José Miguel' });
    expect(res.body.usuario).not.toHaveProperty('password_hash');
  });

  test('A02 contraseña incorrecta devuelve 401 sin revelar si el usuario existe', async () => {
    const malaClave = await api().post('/auth/login', { login: '00247', password: 'otra' });
    const noExiste = await api().post('/auth/login', { login: '99999', password: 'otra' });
    expect(malaClave.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(malaClave.body.error.mensaje).toBe(noExiste.body.error.mensaje);
  });

  test('A03 cuerpo incompleto devuelve 400 con el detalle del campo', async () => {
    const res = await api().post('/auth/login', { login: '00247' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(res.body.error.detalles[0].campo).toBe('password');
  });

  test('A04 rutas protegidas exigen token válido', async () => {
    expect((await api().get('/auth/yo')).status).toBe(401);
    expect((await api('token.falso.123').get('/auth/yo')).status).toBe(401);
  });

  test('A05 /auth/yo devuelve el perfil con el estado de pago', async () => {
    const token = await login('00247');
    const res = await api(token).get('/auth/yo');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ numero_socio: '00247', estado_pago: expect.any(String) });
  });
});

describe('Autorización por rol', () => {
  let socio;
  let admin;
  let guardia;

  beforeAll(async () => {
    [socio, admin, guardia] = await Promise.all([
      login('00247'), login('admin', 'Admin2026!'), login('guardia01', 'Guardia2026!'),
    ]);
  });

  test('R01 un socio no puede listar el padrón de socios', async () => {
    expect((await api(socio).get('/socios')).status).toBe(403);
  });

  test('R02 un socio no puede ver la nómina', async () => {
    expect((await api(socio).get('/nomina')).status).toBe(403);
  });

  test('R03 el administrador filtra socios morosos', async () => {
    const res = await api(admin).get('/socios?estado_pago=VENCIDO&limite=100');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.datos.every((s) => s.estado_pago === 'VENCIDO')).toBe(true);
    expect(res.body.datos.map((s) => s.numero_socio)).toContain('00289');
  });

  test('R04 el administrador busca por nombre', async () => {
    const res = await api(admin).get('/socios?q=Quispe Soto');
    expect(res.status).toBe(200);
    expect(res.body.datos[0].numero_socio).toBe('00247');
  });

  test('R05 el guardia ve el registro de accesos pero no la nómina', async () => {
    expect((await api(guardia).get('/accesos/recientes?limite=5')).status).toBe(200);
    expect((await api(guardia).get('/nomina')).status).toBe(403);
  });

  test('R06 el administrador consulta la nómina simulada', async () => {
    const res = await api(admin).get('/nomina');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body[0]).toMatchObject({ trabajadores: 25 });
  });
});
