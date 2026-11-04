/**
 * Pruebas: invitados, noticias, eventos, tienda y salud del servicio.
 */
'use strict';

const { api, login, db, socioLibre, titularConCupoInvitados, hoyLima, sumarDias } = require('./ayuda');

afterAll(() => db.cerrar());

const dniAleatorio = () => String(Math.floor(10000000 + Math.random() * 89999999));

describe('Salud', () => {
  test('H01 /health responde sin autenticación', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.base_de_datos).toBe('ok');
  });

  test('H02 ruta inexistente: 401 sin sesión (no revela rutas) y 404 con sesión', async () => {
    expect((await api().get('/no-existe')).status).toBe(401);
    const res = await api(await login('00247')).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('Invitados', () => {
  let socio;
  let guardia;
  beforeAll(async () => {
    socio = await login((await titularConCupoInvitados()).numero_socio);
    guardia = await login('guardia01', 'Guardia2026!');
  });

  test('I01 el invitado de hoy ingresa con su QR', async () => {
    const reg = await api(socio).post('/invitados', {
      dni: dniAleatorio(), nombres: 'Lucía', apellidos: 'Prueba Hoy', fecha_visita: hoyLima(),
    });
    expect(reg.status).toBe(201);
    const res = await api(guardia).post('/accesos/validar-guardia', { metodo: 'QR', credencial: reg.body.qr });
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('INVITADO');
  });

  test('I02 un invitado de mañana no puede ingresar hoy', async () => {
    const reg = await api(socio).post('/invitados', {
      dni: dniAleatorio(), nombres: 'Marco', apellidos: 'Prueba Mañana', fecha_visita: sumarDias(hoyLima(), 1),
    });
    const res = await api(guardia).post('/accesos/validar-guardia', { metodo: 'QR', credencial: reg.body.qr });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('Fecha no valida');
  });

  test('I03 DNI inválido devuelve 400', async () => {
    const res = await api(socio).post('/invitados', { dni: '123', nombres: 'X', apellidos: 'Y', fecha_visita: hoyLima() });
    expect(res.status).toBe(400);
  });
});

describe('Comunicación', () => {
  let socio;
  let admin;
  beforeAll(async () => {
    socio = await login('00247');
    admin = await login('admin', 'Admin2026!');
  });

  test('M01 el socio ve noticias vigentes con las importantes primero', async () => {
    const res = await api(socio).get('/noticias');
    expect(res.status).toBe(200);
    expect(res.body[0].categoria).toBe('IMPORTANTE');
  });

  test('M02 el administrador publica una noticia', async () => {
    const res = await api(admin).post('/noticias', {
      titulo: 'Prueba automática de noticia', contenido: 'Contenido generado por las pruebas.', categoria: 'GENERAL',
    });
    expect(res.status).toBe(201);
    expect((await api(admin).delete(`/noticias/${res.body.id}`)).status).toBe(204);
  });

  test('M03 un socio no puede publicar noticias', async () => {
    const res = await api(socio).post('/noticias', { titulo: 'No permitido', contenido: 'Esto no debería publicarse.' });
    expect(res.status).toBe(403);
  });

  test('M04 inscripción a las olimpiadas y rechazo de doble inscripción', async () => {
    const token = await login((await socioLibre(7)).numero_socio);
    const { body: eventos } = await api(token).get('/eventos');
    const olimpiadas = eventos.find((e) => e.titulo.startsWith('Olimpiadas'));
    if (olimpiadas.estoy_inscrito) await api(token).delete(`/eventos/${olimpiadas.id}/inscripcion`);

    const res = await api(token).post(`/eventos/${olimpiadas.id}/inscripcion`, { disciplina: 'Vóley' });
    expect(res.status).toBe(201);
    const doble = await api(token).post(`/eventos/${olimpiadas.id}/inscripcion`, { disciplina: 'Vóley' });
    expect(doble.status).toBe(409);
    expect((await api(token).delete(`/eventos/${olimpiadas.id}/inscripcion`)).status).toBe(204);
  });

  test('M05 servicios del club', async () => {
    const res = await api(socio).get('/servicios');
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.tipo)).toEqual(expect.arrayContaining(['POSTA', 'CAPILLA', 'RESTAURANTE']));
  });
});

describe('Tienda (simulada)', () => {
  test('T01 compra: descuenta stock, genera cuota y se paga con Yape', async () => {
    const token = await login((await socioLibre(8)).numero_socio);
    const { body: productos } = await api(token).get('/tienda/productos');
    const llavero = productos.find((p) => p.sku === 'LLA-OFI-01');

    const pedido = await api(token).post('/tienda/pedidos', { items: [{ producto_id: llavero.id, cantidad: 2 }] });
    expect(pedido.status).toBe(201);
    expect(pedido.body.total).toBe(16);

    const despues = (await api(token).get('/tienda/productos')).body.find((p) => p.id === llavero.id);
    expect(despues.stock).toBe(llavero.stock - 2);

    const pago = await api(token).post('/pagos', {
      cuota_id: pedido.body.cuota.id, metodo: 'YAPE_PLIN', billetera: { celular: '987654321', codigo_aprobacion: '123456' },
    });
    expect(pago.status).toBe(201);

    const { body: mios } = await api(token).get('/tienda/pedidos/mios');
    expect(mios.find((p) => p.id === pedido.body.pedido_id).estado).toBe('PAGADO');
  });

  test('T02 no se vende más que el stock disponible', async () => {
    const token = await login('00247');
    const { body: productos } = await api(token).get('/tienda/productos');
    const casaca = productos.find((p) => p.sku === 'CAS-DEP-01');
    const res = await api(token).post('/tienda/pedidos', { items: [{ producto_id: casaca.id, cantidad: 10 }] });
    if (casaca.stock < 10) {
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('SIN_STOCK');
    } else {
      expect(res.status).toBe(201);
    }
  });
});
