/**
 * Imágenes de eventos, productos y servicios: subida, entrega, permisos y
 * administración de la tienda desde el panel.
 */
'use strict';

const request = require('supertest');
const { app, API, api, login, db } = require('./ayuda');

// PNG válido de 1x1 píxel
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);

function subir(token, datos, tipo = 'image/png') {
  const r = request(app).post(`${API}/archivos`).set('Content-Type', tipo);
  return (token ? r.set('Authorization', `Bearer ${token}`) : r).send(datos);
}

let admin;
let socio;
beforeAll(async () => {
  admin = await login('admin', 'Admin2026!');
  socio = await login('00247');
});
afterAll(() => db.cerrar?.());

describe('Subida y entrega de imágenes', () => {
  test('IM01 el administrador sube un PNG y cualquiera puede verlo', async () => {
    const res = await subir(admin, PNG);
    expect(res.status).toBe(201);
    expect(res.body.ruta).toMatch(/^archivos\/[0-9a-f-]{36}\.png$/);

    const img = await request(app).get(`${API}/${res.body.ruta}`); // sin sesión
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(img.body, PNG)).toBe(0);
  });

  test('IM02 el formato se detecta por el contenido, no por el Content-Type', async () => {
    const res = await subir(admin, JPG, 'application/octet-stream');
    expect(res.status).toBe(201);
    expect(res.body.ruta).toMatch(/\.jpg$/);
  });

  test('IM03 un archivo que no es imagen se rechaza (415), aunque diga image/png', async () => {
    const res = await subir(admin, Buffer.from('<script>alert(1)</script> no soy una imagen'), 'image/png');
    expect(res.status).toBe(415);
    expect(res.body.error.codigo).toBe('FORMATO_NO_SOPORTADO');
  });

  test('IM04 una imagen de más de 5 MB se rechaza (413)', async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const res = await subir(admin, grande);
    expect(res.status).toBe(413);
    expect(res.body.error.mensaje).toMatch(/5 MB/);
  });

  test('IM05 solo el administrador sube imágenes', async () => {
    expect((await subir(socio, PNG)).status).toBe(403);
    expect((await subir(null, PNG)).status).toBe(401);
  });

  test('IM06 nombres inventados o con rutas no salen del directorio', async () => {
    for (const nombre of ['../../package.json', '..%2F..%2Fpackage.json', 'cualquiera.png',
      '00000000-0000-0000-0000-000000000000.png']) {
      const res = await request(app).get(`${API}/archivos/${nombre}`);
      expect([401, 404]).toContain(res.status); // 401: la ruta normalizada cae fuera de /archivos
    }
  });
});

describe('Administración de la tienda (panel)', () => {
  let producto;
  const sku = `PRU-${Date.now().toString(36).toUpperCase()}`.slice(0, 20);

  test('IM07 el administrador crea un producto con imagen y el socio lo ve en la tienda', async () => {
    const { body: img } = await subir(admin, PNG);
    const res = await api(admin).post('/tienda/productos', {
      sku, nombre: 'Polo de prueba', descripcion: 'Creado por las pruebas', categoria: 'Ropa',
      precio: 49.9, stock: 10, imagen_url: img.ruta,
    });
    expect(res.status).toBe(201);
    producto = res.body;
    const { body: catalogo } = await api(socio).get('/tienda/productos');
    expect(catalogo.find((p) => p.id === producto.id).imagen_url).toBe(img.ruta);
  });

  test('IM08 editar solo algunos campos, quitar la imagen y desactivarlo', async () => {
    const res = await api(admin).patch(`/tienda/productos/${producto.id}`, { precio: 39.9, imagen_url: null, activo: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ precio: 39.9, imagen_url: null, activo: false, nombre: 'Polo de prueba' });
    const { body: catalogo } = await api(socio).get('/tienda/productos');
    expect(catalogo.some((p) => p.id === producto.id)).toBe(false); // inactivo: no aparece al socio
    const { body: todos } = await api(admin).get('/tienda/admin/productos');
    expect(todos.find((p) => p.id === producto.id)).toMatchObject({ activo: false, vendidos: 0 });
  });

  test('IM09 validaciones: SKU repetido (409), precio inválido y ruta de imagen falsa (400)', async () => {
    const base = { sku, nombre: 'Otro', categoria: 'Ropa', precio: 10, stock: 1 };
    expect((await api(admin).post('/tienda/productos', base)).status).toBe(409);
    expect((await api(admin).post('/tienda/productos', { ...base, sku: 'PRU-X1', precio: -5 })).status).toBe(400);
    expect((await api(admin).patch(`/tienda/productos/${producto.id}`, { imagen_url: '../../etc/passwd' })).status).toBe(400);
    expect((await api(admin).patch(`/tienda/productos/${producto.id}`, { imagen_url: 'http://inseguro.com/a.png' })).status).toBe(400);
    expect((await api(admin).patch(`/tienda/productos/${producto.id}`, {})).status).toBe(400);
  });

  test('IM10 un socio no administra la tienda', async () => {
    expect((await api(socio).get('/tienda/admin/productos')).status).toBe(403);
    expect((await api(socio).patch(`/tienda/productos/${producto.id}`, { precio: 1 })).status).toBe(403);
  });

  afterAll(async () => {
    if (producto) await db.query('DELETE FROM producto WHERE id = $1', [producto.id]);
  });
});

describe('Imágenes de servicios y eventos', () => {
  test('IM11 el administrador pone la foto del restaurante y la app la recibe', async () => {
    const { body: servicios } = await api(socio).get('/servicios');
    const restaurante = servicios.find((s) => s.tipo === 'RESTAURANTE');
    const anterior = restaurante.imagen_url ?? null;
    const { body: img } = await subir(admin, PNG);
    const res = await api(admin).patch(`/servicios/${restaurante.id}`, { imagen_url: img.ruta, horario: 'Mar-Dom 12:00-22:00' });
    expect(res.status).toBe(200);
    const { body: despues } = await api(socio).get('/servicios');
    expect(despues.find((s) => s.id === restaurante.id)).toMatchObject({ imagen_url: img.ruta, horario: 'Mar-Dom 12:00-22:00' });
    // deja los datos como estaban
    await api(admin).patch(`/servicios/${restaurante.id}`, { imagen_url: anterior, horario: restaurante.horario });
    expect((await api(socio).patch(`/servicios/${restaurante.id}`, { horario: 'nunca' })).status).toBe(403);
  });

  test('IM12 el administrador cambia la imagen de un evento', async () => {
    const { body: eventos } = await api(socio).get('/eventos');
    const evento = eventos[0];
    const { body: img } = await subir(admin, PNG);
    const res = await api(admin).patch(`/eventos/${evento.id}`, { imagen_url: img.ruta });
    expect(res.status).toBe(200);
    const { body: despues } = await api(socio).get('/eventos');
    expect(despues.find((e) => e.id === evento.id).imagen_url).toBe(img.ruta);
    await api(admin).patch(`/eventos/${evento.id}`, { imagen_url: evento.imagen_url ?? null });
    expect((await api(admin).patch('/eventos/00000000-0000-0000-0000-000000000000', { imagen_url: null })).status).toBe(404);
  });
});
