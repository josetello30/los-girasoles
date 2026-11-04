/**
 * Pruebas de seguridad de la API expuesta (caja negra), inspiradas en el
 * OWASP API Security Top 10: autenticación, autorización por rol y por
 * objeto, inyección, exposición de datos y fuerza bruta.
 *
 * IMPORTANTE: la última prueba agota el límite de intentos de login desde
 * la IP que ejecuta las pruebas durante 15 minutos. Con `make test-e2e`
 * corre en su propio contenedor y no afecta al panel ni a la app.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { cliente, login, garita, solicitar } from '../lib/cliente.mjs';

let socio;
let admin;
before(async () => {
  socio = await login('00247');
  admin = await login('admin', 'Admin2026!');
});

describe('SEG-01 · Autenticación', () => {
  it('sin token no hay acceso a datos (401)', async () => {
    for (const ruta of ['/auth/yo', '/pagos/estado-cuenta', '/socios', '/accesos/recientes']) {
      assert.equal((await solicitar('GET', ruta)).status, 401, ruta);
    }
  });

  it('un token alterado se rechaza (firma JWT)', async () => {
    const [cab, carga, firma] = socio.split('.');
    const datos = JSON.parse(Buffer.from(carga, 'base64url').toString());
    const falsa = Buffer.from(JSON.stringify({ ...datos, rol: 'ADMIN' })).toString('base64url');
    const r = await cliente(`${cab}.${falsa}.${firma}`).get('/socios');
    assert.equal(r.status, 401);
  });

  it('contraseña incorrecta: mensaje genérico que no revela si el usuario existe', async () => {
    const existe = await solicitar('POST', '/auth/login', { cuerpo: { login: '00247', password: 'incorrecta' } });
    const noExiste = await solicitar('POST', '/auth/login', { cuerpo: { login: '99999', password: 'incorrecta' } });
    assert.equal(existe.status, 401);
    assert.equal(noExiste.status, 401);
    assert.equal(existe.body.error.mensaje, noExiste.body.error.mensaje);
  });

  it('la garita sin API key o con una clave falsa recibe 401', async () => {
    assert.equal((await garita({ uid: 'A1B2C3D4' }, null)).status, 401);
    assert.equal((await garita({ uid: 'A1B2C3D4' }, 'clave-inventada')).status, 401);
  });
});

describe('SEG-02 · Autorización por rol y por objeto', () => {
  it('un socio no accede a rutas de administración (403)', async () => {
    const c = cliente(socio);
    assert.equal((await c.get('/socios')).status, 403);
    assert.equal((await c.get('/nomina')).status, 403);
    assert.equal((await c.post('/noticias', { titulo: 'No permitido', contenido: 'Intento de un socio.' })).status, 403);
  });

  it('un socio no puede pagar ni cancelar recursos de otro socio', async () => {
    const otro = await login('00289');
    const { body } = await cliente(otro).get('/pagos/estado-cuenta');
    const cuotaAjena = body.por_pagar[0].cuota_id;
    const r = await cliente(socio).post('/pagos', {
      cuota_id: cuotaAjena, metodo: 'TARJETA',
      tarjeta: { numero: '4111 1111 1111 1111', vencimiento: '12/30', cvv: '123', titular: 'Ajeno' },
    });
    assert.ok([403, 404].includes(r.status), `HTTP ${r.status}`);
  });

  it('el guardia ve el registro de accesos pero no la nómina', async () => {
    const guardia = await login('guardia01', 'Guardia2026!');
    assert.equal((await cliente(guardia).get('/accesos/recientes')).status, 200);
    assert.equal((await cliente(guardia).get('/nomina')).status, 403);
  });
});

describe('SEG-03 · Inyección y validación de entradas', () => {
  it('una inyección SQL en la búsqueda se trata como texto', async () => {
    const r = await cliente(admin).get(`/socios?q=${encodeURIComponent("' OR '1'='1' --")}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
  });

  it('una inyección en el UID de la garita no rompe nada y se deniega', async () => {
    const r = await garita({ uid: "A1B2'; DROP TABLE socio; --" });
    assert.ok([400, 403].includes(r.status), `HTTP ${r.status}`);
    assert.equal((await solicitar('GET', '/health')).body.base_de_datos, 'ok');
  });

  it('datos con formato inválido devuelven 400 con detalle por campo', async () => {
    const r = await cliente(socio).post('/reservas', { instalacion_id: 'no-es-uuid', fecha: 'ayer', hora_inicio: '25:99' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.detalles, 'sin detalle de validación');
  });

  it('un cuerpo de más de 100 KB se rechaza', async () => {
    const r = await solicitar('POST', '/auth/login', { cuerpo: { login: 'x'.repeat(200_000), password: 'x' } });
    assert.equal(r.status, 413);
  });
});

describe('SEG-04 · Exposición de datos y cabeceras', () => {
  it('el perfil no expone el hash de la contraseña', async () => {
    const r = await cliente(socio).get('/auth/yo');
    const texto = JSON.stringify(r.body).toLowerCase();
    assert.ok(!texto.includes('password') && !texto.includes('$2'), 'aparece información de la contraseña');
  });

  it('las respuestas llevan cabeceras de seguridad y no revelan la tecnología', async () => {
    const r = await solicitar('GET', '/health');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('strict-transport-security'));
  });

  it('un error interno no filtra trazas ni SQL', async () => {
    const r = await cliente(admin).get('/socios/00000000-0000-0000-0000-000000000000');
    assert.equal(r.status, 404);
    assert.ok(!/at .*\.js|SELECT|stack/i.test(JSON.stringify(r.body)));
  });
});

describe('SEG-05 · Fuerza bruta en el login', () => {
  it('tras 10 intentos fallidos la IP queda bloqueada (429), aunque falsifique X-Forwarded-For', async () => {
    let ultimo;
    for (let i = 0; i < 12; i += 1) {
      ultimo = await solicitar('POST', '/auth/login', {
        cuerpo: { login: 'admin', password: `intento-${i}` },
        cabeceras: { 'X-Forwarded-For': `203.0.113.${i + 1}` }, // IPs falsas distintas en cada intento
      });
      if (ultimo.status === 429) break;
    }
    assert.equal(ultimo.status, 429, 'el límite de intentos no se activó');
    assert.equal(ultimo.body.error.codigo, 'DEMASIADOS_INTENTOS');
  });
});
