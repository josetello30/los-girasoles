/**
 * Pruebas: disponibilidad, reservas con reglas de negocio y pagos en línea.
 */
'use strict';

const {
  api, login, db, socioLibre, franjaLibre, instalacion, hoyLima, sumarDias,
} = require('./ayuda');

afterAll(() => db.cerrar());

const TARJETA_OK = { numero: '4111 1111 1111 1111', vencimiento: '12/30', cvv: '123', titular: 'Prueba Automatica' };
const TARJETA_SIN_FONDOS = { ...TARJETA_OK, numero: '4000000000000002' };

describe('Disponibilidad', () => {
  let token;
  beforeAll(async () => { token = await login('00247'); });

  test('D01 lista instalaciones con franjas libres del día', async () => {
    const res = await api(token).get(`/instalaciones?fecha=${sumarDias(hoyLima(), 2)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(14);
    expect(res.body[0]).toEqual(expect.objectContaining({ horarios_disponibles: expect.any(Number), estado: expect.any(String) }));
  });

  test('D02 la piscina muestra mantenimiento en los días bloqueados', async () => {
    const piscina = await instalacion('PISCINA-1');
    const res = await api(token).get(`/instalaciones/${piscina.id}/disponibilidad?fecha=${sumarDias(hoyLima(), 17)}`);
    expect(res.status).toBe(200);
    expect(res.body.franjas.every((f) => f.motivo === 'MANTENIMIENTO')).toBe(true);
  });

  test('D03 fecha con formato inválido devuelve 400', async () => {
    const res = await api(token).get('/instalaciones?fecha=05-11-2026');
    expect(res.status).toBe(400);
  });
});

describe('Ciclo completo: reservar -> pagar -> confirmar -> cancelar', () => {
  let tokenA;
  let tokenB;
  let franja;
  let reserva;

  beforeAll(async () => {
    const [a, b] = await Promise.all([socioLibre(0), socioLibre(1)]);
    [tokenA, tokenB] = await Promise.all([login(a.numero_socio), login(b.numero_socio)]);
    franja = await franjaLibre(tokenA, 'FRONTON-1');
  });

  test('C01 una cancha con tarifa queda PENDIENTE y genera su cuota', async () => {
    const res = await api(tokenA).post('/reservas', franja);
    expect(res.status).toBe(201);
    reserva = res.body;
    expect(reserva.estado).toBe('PENDIENTE');
    expect(reserva.cuota.monto).toBe(10);
  });

  test('C02 otro socio no puede reservar la misma franja', async () => {
    const res = await api(tokenB).post('/reservas', franja);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('RESERVA_SOLAPADA');
  });

  test('C03 la pasarela rechaza una tarjeta sin fondos', async () => {
    const res = await api(tokenA).post('/pagos', { cuota_id: reserva.cuota.id, metodo: 'TARJETA', tarjeta: TARJETA_SIN_FONDOS });
    expect(res.status).toBe(402);
    expect(res.body.error.mensaje).toMatch(/Fondos insuficientes/);
  });

  test('C04 un socio no puede pagar la cuota de otro', async () => {
    const res = await api(tokenB).post('/pagos', { cuota_id: reserva.cuota.id, metodo: 'TARJETA', tarjeta: TARJETA_OK });
    expect(res.status).toBe(404);
  });

  test('C05 el pago aprobado confirma la reserva', async () => {
    const res = await api(tokenA).post('/pagos', { cuota_id: reserva.cuota.id, metodo: 'TARJETA', tarjeta: TARJETA_OK });
    expect(res.status).toBe(201);
    expect(res.body.comprobante).toMatchObject({ monto: 10, metodo: 'TARJETA', detalle: 'Tarjeta •••• 1111' });

    const mias = await api(tokenA).get('/reservas/mias');
    expect(mias.body.find((r) => r.id === reserva.id).estado).toBe('CONFIRMADA');
  });

  test('C06 no se puede pagar dos veces la misma cuota', async () => {
    const res = await api(tokenA).post('/pagos', { cuota_id: reserva.cuota.id, metodo: 'TARJETA', tarjeta: TARJETA_OK });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('CUOTA_PAGADA');
  });

  test('C07 al cancelar una reserva pagada se informa el reembolso y la franja se libera', async () => {
    const res = await api(tokenA).delete(`/reservas/${reserva.id}`);
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/reembolso/);

    const otra = await api(tokenB).post('/reservas', franja);
    expect(otra.status).toBe(201);
    await api(tokenB).delete(`/reservas/${otra.body.id}`);
  });
});

describe('Reglas de negocio', () => {
  test('N01 un socio moroso no puede reservar', async () => {
    const token = await login('00289');
    const franja = await franjaLibre(token, 'TENIS-1');
    const res = await api(token).post('/reservas', franja);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('MOROSIDAD');
    expect(res.body.error.mensaje).toMatch(/S\/ 540\.00/);
  });

  test('N02 no se reserva con más de 14 días de anticipación', async () => {
    const token = await login((await socioLibre(2)).numero_socio);
    const inst = await instalacion('VOLEY-1');
    const res = await api(token).post('/reservas', { instalacion_id: inst.id, fecha: sumarDias(hoyLima(), 20), hora_inicio: '10:00' });
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('FUERA_DE_VENTANA');
  });

  test('N03 una hora que no coincide con los bloques se rechaza', async () => {
    const token = await login((await socioLibre(2)).numero_socio);
    const inst = await instalacion('VOLEY-1');
    const res = await api(token).post('/reservas', { instalacion_id: inst.id, fecha: sumarDias(hoyLima(), 5), hora_inicio: '10:15' });
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('FRANJA_INVALIDA');
  });

  test('N04 la posta (gratuita) se confirma de inmediato y sin cuota', async () => {
    const token = await login((await socioLibre(3)).numero_socio);
    const franja = await franjaLibre(token, 'POSTA-1');
    const res = await api(token).post('/reservas', franja);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'CONFIRMADA', cuota: null });
    await api(token).delete(`/reservas/${res.body.id}`);
  });

  test('N05 máximo 3 reservas vigentes por socio', async () => {
    const token = await login((await socioLibre(4)).numero_socio);
    const creadas = [];
    for (const codigo of ['POSTA-1', 'CAPILLA-1', 'TENIS-2']) {
      const r = await api(token).post('/reservas', await franjaLibre(token, codigo, 4));
      expect(r.status).toBe(201);
      creadas.push(r.body.id);
    }
    const cuarta = await api(token).post('/reservas', await franjaLibre(token, 'VOLEY-1', 6));
    expect(cuarta.status).toBe(409);
    expect(cuarta.body.error.codigo).toBe('LIMITE_RESERVAS');
    for (const id of creadas) await api(token).delete(`/reservas/${id}`);
  });
});

describe('Estado de cuenta y pagos', () => {
  test('E01 el estado de cuenta trae resumen, cuotas por pagar e historial', async () => {
    const token = await login('00289');
    const res = await api(token).get('/pagos/estado-cuenta');
    expect(res.status).toBe(200);
    expect(res.body.resumen).toMatchObject({ estado_pago: 'VENCIDO', deuda_vencida: 540 });
    expect(res.body.por_pagar.length).toBeGreaterThanOrEqual(3);
    expect(res.body.cuota_mensual).toBe(180);
  });

  test('E02 Yape con código inválido es rechazado', async () => {
    const socio = await socioLibre(5);
    const token = await login(socio.numero_socio);
    const { body } = await api(token).get('/pagos/estado-cuenta');
    const cuota = body.por_pagar[0];
    const res = await api(token).post('/pagos', {
      cuota_id: cuota.cuota_id, metodo: 'YAPE_PLIN', billetera: { celular: '987654321', codigo_aprobacion: '000000' },
    });
    expect(res.status).toBe(402);
  });

  test('E03 datos de tarjeta incompletos devuelven 400', async () => {
    const token = await login('00247');
    const res = await api(token).post('/pagos', { cuota_id: '00000000-0000-0000-0000-000000000000', metodo: 'TARJETA', tarjeta: { numero: '4111' } });
    expect(res.status).toBe(400);
  });
});
