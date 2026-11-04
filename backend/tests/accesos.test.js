/**
 * Pruebas: control de acceso IoT (RFID y QR dinámico) y requisito RNF02.
 */
'use strict';

const { api, garita, login, db } = require('./ayuda');

afterAll(() => db.cerrar());

describe('Garita: autenticación del dispositivo', () => {
  test('G01 sin API key devuelve 401', async () => {
    const res = await garita({ uid: 'A1B2C3D4' }, null);
    expect(res.status).toBe(401);
  });

  test('G02 con API key incorrecta devuelve 401', async () => {
    const res = await garita({ uid: 'A1B2C3D4' }, 'clave-falsa');
    expect(res.status).toBe(401);
  });

  test('G03 UID con formato inválido devuelve 400', async () => {
    const res = await garita({ uid: 'XYZ' });
    expect(res.status).toBe(400);
  });
});

describe('Garita: tarjetas RFID', () => {
  test('G04 tarjeta activa de socio: permitido con saludo para el LCD', async () => {
    const res = await garita({ uid: 'a1b2c3d4' }); // minúsculas también se aceptan
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ permitido: true, tipo: 'SOCIO', mensaje: 'Hola Jose' });
    expect(res.body.mensaje.length).toBeLessThanOrEqual(16);
  });

  test('G05 tarjeta reportada como perdida: denegado', async () => {
    const res = await garita({ uid: 'AABBCCDD' }); // tarjeta roja de Wokwi
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ permitido: false, mensaje: 'Tarjeta perdida' });
  });

  test('G06 tarjeta desconocida: denegado y registrado sin persona', async () => {
    const res = await garita({ uid: '0BADCAFE' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ permitido: false, tipo: 'DESCONOCIDO', mensaje: 'No registrada' });
  });

  test('G07 tarjeta de personal de limpieza: permitido como trabajador', async () => {
    const res = await garita({ uid: '55667788', direccion: 'ENTRADA' }); // tarjeta amarilla
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('TRABAJADOR');
  });

  test('G08 la morosidad NO impide el ingreso (club residencial)', async () => {
    const res = await garita({ uid: '11223344' }); // tarjeta verde: socio 00289, moroso
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ permitido: true, persona: 'Roberto Silva Castro' });
  });

  test('G10 tarjeta NFC de 7 bytes de un socio suspendido: denegado', async () => {
    const res = await garita({ uid: '04112233445566' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ permitido: false, mensaje: 'Socio suspendido' });
  });

  test('G11 llavero C0FFEE99 no registrado: denegado', async () => {
    const res = await garita({ uid: 'C0FFEE99' });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('No registrada');
  });

  test('G09 cada intento queda en el log con su latencia', async () => {
    const res = await garita({ uid: 'A1B2C3D4' });
    const { rows } = await db.query('SELECT resultado, latencia_ms, metodo FROM log_acceso WHERE id = $1', [res.body.registro_id]);
    expect(rows[0]).toMatchObject({ resultado: 'PERMITIDO', metodo: 'RFID' });
    expect(rows[0].latencia_ms).toEqual(expect.any(Number));
  });
});

describe('QR dinámico (RF01)', () => {
  let token;
  beforeAll(async () => { token = await login('00247'); });

  test('Q01 el socio genera un QR que vence en 5 minutos', async () => {
    const res = await api(token).post('/accesos/qr');
    expect(res.status).toBe(201);
    expect(res.body.qr).toMatch(/^GIR1:/);
    expect(res.body.vigencia_segundos).toBe(300);
    const segundos = (new Date(res.body.expira_en) - new Date(res.body.emitido_en)) / 1000;
    expect(segundos).toBeCloseTo(300, 0);
  });

  test('Q02 el QR permite un ingreso y no puede reutilizarse', async () => {
    const { body } = await api(token).post('/accesos/qr');
    const primero = await garita({ metodo: 'QR', credencial: body.qr });
    const segundo = await garita({ metodo: 'QR', credencial: body.qr });
    expect(primero.status).toBe(200);
    expect(segundo.status).toBe(403);
    expect(segundo.body.mensaje).toBe('QR ya usado');
  });

  test('Q03 un QR expirado es rechazado', async () => {
    const { body } = await api(token).post('/accesos/qr');
    // Se simula el paso del tiempo adelantando el vencimiento en la BD
    const hash = require('../src/utils/seguridad').sha256(body.qr.slice(5));
    const { pool } = require('../src/db');
    await pool.query(
      "UPDATE token_qr SET emitido_en = now() - interval '10 minutes', expira_en = now() - interval '5 minutes' WHERE token_hash = $1",
      [hash],
    );
    const res = await garita({ metodo: 'QR', credencial: body.qr });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('QR expirado');
  });

  test('Q04 un QR inventado es rechazado', async () => {
    const res = await garita({ metodo: 'QR', credencial: 'GIR1:inventado-123456' });
    expect(res.status).toBe(403);
    expect(res.body.mensaje).toBe('QR invalido');
  });

  test('Q05 el guardia valida el QR desde su celular', async () => {
    const guardia = await login('guardia01', 'Guardia2026!');
    const { body } = await api(token).post('/accesos/qr');
    const res = await api(guardia).post('/accesos/validar-guardia', { metodo: 'QR', credencial: body.qr, punto_acceso: 'GARITA-PEATONAL' });
    expect(res.status).toBe(200);
    expect(res.body.punto_acceso).toBe('GARITA-PEATONAL');
  });
});

describe('RNF02: tiempo de respuesta de la validación (< 2 s)', () => {
  test('P01 100 validaciones consecutivas con p95 bajo 2000 ms', async () => {
    const uids = ['A1B2C3D4', 'AABBCCDD', '55667788', 'C0FFEE99', '11223344', '04112233445566'];
    const tiempos = [];
    for (let i = 0; i < 100; i += 1) {
      const inicio = process.hrtime.bigint();
      await garita({ uid: uids[i % uids.length] });
      tiempos.push(Number(process.hrtime.bigint() - inicio) / 1e6);
    }
    tiempos.sort((a, b) => a - b);
    const p95 = tiempos[94];
    const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
    // Se imprime para registrarlo como evidencia en el informe
    console.log(`RNF02 -> promedio ${promedio.toFixed(1)} ms | p95 ${p95.toFixed(1)} ms | máximo ${tiempos[99].toFixed(1)} ms`);
    expect(p95).toBeLessThan(2000);
  });
});
