/**
 * Pruebas de punta a punta (E2E) de los flujos que cruzan componentes:
 *   App móvil -> API -> PostgreSQL -> Garita IoT -> Panel administrativo.
 *
 * Se ejecutan contra el sistema LEVANTADO (make up), no contra un simulacro.
 * Cada prueba deja los datos como los encontró cuando es posible (retira la
 * noticia, cancela la reserva). Lo que no se puede deshacer por diseño
 * (registros de acceso, pagos) queda como un dato más de la demostración.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  PANEL, cliente, login, garita, hoyLima, titularAlAzar, dniAleatorio, aptoParaLcd, solicitar,
} from '../lib/cliente.mjs';

const RNF02_MS = 2000;
const TARJETA_OK = { numero: '4111 1111 1111 1111', vencimiento: '12/30', cvv: '123', titular: 'Prueba E2E' };
const TARJETA_SIN_FONDOS = { ...TARJETA_OK, numero: '4000 0000 0000 0002' };

let admin;
before(async () => {
  admin = await login('admin', 'Admin2026!');
});

/** Busca un registro en el registro de accesos que ve el guardia y el panel. */
async function enRegistro(registroId) {
  const { body } = await cliente(admin).get('/accesos/recientes?limite=100');
  return body.find((a) => a.id === registroId);
}

describe('E2E-01 · Ingreso con QR dinámico (RF01 + RF05 + RNF02)', () => {
  let socio;
  let qr;
  let registroId;

  it('el socio genera su QR en la app (vigencia de 5 minutos)', async () => {
    socio = await login('00247');
    const r = await cliente(socio).post('/accesos/qr');
    assert.equal(r.status, 201);
    qr = r.body;
    const vigencia = (new Date(qr.expira_en) - Date.now()) / 1000;
    assert.ok(vigencia > 240 && vigencia <= 300, `vigencia inesperada: ${vigencia}s`);
  });

  it('la garita lee el QR y permite el ingreso en menos de 2 s', async () => {
    const r = await garita({ metodo: 'QR', credencial: qr.qr });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.permitido, true);
    assert.ok(aptoParaLcd(r.body.mensaje), `mensaje no apto para el LCD: "${r.body.mensaje}"`);
    assert.ok(r.ms < RNF02_MS, `tardó ${r.ms.toFixed(0)} ms`);
    registroId = r.body.registro_id;
  });

  it('el mismo QR no sirve dos veces (un solo uso)', async () => {
    const r = await garita({ metodo: 'QR', credencial: qr.qr });
    assert.equal(r.status, 403);
    assert.equal(r.body.permitido, false);
  });

  it('el ingreso aparece en el registro en vivo del guardia y del panel', async () => {
    const acceso = await enRegistro(registroId);
    assert.ok(acceso, 'el registro no aparece');
    assert.equal(acceso.resultado, 'PERMITIDO');
    assert.equal(acceso.metodo, 'QR');
  });
});

describe('E2E-02 · Tarjetas RFID del simulador Wokwi (contrato del ESP32)', () => {
  const casos = [
    { uid: 'A1B2C3D4', permitido: true, caso: 'socio 00247 activo' },
    { uid: '11223344', permitido: true, caso: 'socio 00289 moroso: la deuda NO impide entrar' },
    { uid: '55667788', permitido: true, caso: 'personal de limpieza (marca asistencia)' },
    { uid: 'AABBCCDD', permitido: false, caso: 'tarjeta reportada como perdida' },
    { uid: 'C0FFEE99', permitido: false, caso: 'tarjeta no registrada' },
    { uid: '04112233445566', permitido: false, caso: 'socio suspendido (tag NFC de 7 bytes)' },
  ];
  for (const c of casos) {
    it(`${c.uid}: ${c.permitido ? 'permitido' : 'denegado'} · ${c.caso}`, async () => {
      const r = await garita({ uid: c.uid });
      assert.equal(r.status, c.permitido ? 200 : 403, JSON.stringify(r.body));
      assert.equal(r.body.permitido, c.permitido);
      assert.ok(aptoParaLcd(r.body.mensaje), `mensaje no apto para el LCD: "${r.body.mensaje}"`);
      assert.ok(r.ms < RNF02_MS, `tardó ${r.ms.toFixed(0)} ms`);
      // Todo intento queda registrado, también los denegados (auditoría)
      assert.ok(await enRegistro(r.body.registro_id), 'el intento no quedó registrado');
    });
  }
});

describe('E2E-03 · Socio moroso: no reserva, pero sí ingresa', () => {
  let moroso;
  before(async () => { moroso = await login('00289'); });

  it('su estado de cuenta figura como VENCIDO', async () => {
    const r = await cliente(moroso).get('/pagos/estado-cuenta');
    assert.equal(r.status, 200);
    assert.equal(r.body.resumen.estado_pago, 'VENCIDO');
    assert.ok(r.body.resumen.deuda_vencida > 0);
  });

  it('la app le impide reservar e indica el monto adeudado', async () => {
    const { body: inst } = await cliente(moroso).get(`/instalaciones?fecha=${hoyLima(5)}`);
    const tenis = inst.find((i) => i.codigo === 'TENIS-1');
    const r = await cliente(moroso).post('/reservas', { instalacion_id: tenis.id, fecha: hoyLima(5), hora_inicio: '10:00' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.codigo, 'MOROSIDAD');
    assert.match(r.body.error.mensaje, /S\/ \d+\.\d{2}/);
  });

  it('su tarjeta sigue abriendo la garita (decisión de negocio)', async () => {
    const r = await garita({ uid: '11223344' });
    assert.equal(r.status, 200);
  });
});

describe('E2E-04 · Reserva con pago en línea, visible en la agenda del panel (RF02)', () => {
  let socio;
  let otro;
  let franja;
  let reserva;

  before(async () => {
    socio = await titularAlAzar(admin, 'AL_DIA');
    otro = await titularAlAzar(admin, 'AL_DIA');
  });

  it('el socio consulta la disponibilidad y elige una franja libre', async () => {
    const { body: lista } = await cliente(socio.token).get(`/instalaciones?fecha=${hoyLima(3)}`);
    const tenis = lista.find((i) => i.codigo === 'TENIS-1');
    for (let d = 3; d <= 13 && !franja; d += 1) {
      const { body } = await cliente(socio.token).get(`/instalaciones/${tenis.id}/disponibilidad?fecha=${hoyLima(d)}`);
      const libre = body.franjas.find((f) => f.disponible);
      if (libre) franja = { instalacion_id: tenis.id, fecha: hoyLima(d), hora_inicio: libre.hora_inicio };
    }
    assert.ok(franja, 'no hay franjas libres en las próximas 2 semanas');
  });

  it('la reserva con tarifa queda PENDIENTE de pago', async () => {
    const r = await cliente(socio.token).post('/reservas', franja);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    reserva = r.body;
    assert.equal(reserva.estado, 'PENDIENTE');
    assert.ok(reserva.cuota?.id, 'la reserva no generó cuota');
  });

  it('otro socio ya no puede tomar esa franja', async () => {
    const r = await cliente(otro.token).post('/reservas', franja);
    assert.equal(r.status, 409);
  });

  it('la pasarela rechaza una tarjeta sin fondos (402) sin confirmar la reserva', async () => {
    const r = await cliente(socio.token).post('/pagos', { cuota_id: reserva.cuota.id, metodo: 'TARJETA', tarjeta: TARJETA_SIN_FONDOS });
    assert.equal(r.status, 402);
  });

  it('con una tarjeta válida la reserva pasa a CONFIRMADA y el comprobante oculta el número', async () => {
    const r = await cliente(socio.token).post('/pagos', { cuota_id: reserva.cuota.id, metodo: 'TARJETA', tarjeta: TARJETA_OK });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.comprobante.detalle, 'Tarjeta •••• 1111');
    assert.ok(!JSON.stringify(r.body).includes('4111 1111 1111 1111'), 'el número completo de la tarjeta aparece en la respuesta');
    const { body: mias } = await cliente(socio.token).get('/reservas/mias');
    assert.equal(mias.find((x) => x.id === reserva.id).estado, 'CONFIRMADA');
  });

  it('la reserva aparece en la agenda del día que ve la administración', async () => {
    const { body } = await cliente(admin).get(`/reservas?fecha=${franja.fecha}`);
    assert.ok(body.some((x) => x.id === reserva.id), 'no aparece en la agenda');
  });

  it('al cancelarla, la franja vuelve a quedar libre (limpieza de la prueba)', async () => {
    const r = await cliente(socio.token).delete(`/reservas/${reserva.id}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { body } = await cliente(otro.token).get(`/instalaciones/${franja.instalacion_id}/disponibilidad?fecha=${franja.fecha}`);
    assert.equal(body.franjas.find((f) => f.hora_inicio === franja.hora_inicio).disponible, true);
  });
});

describe('E2E-05 · Pago en ventanilla desde el panel actualiza la app del socio', () => {
  let socio;
  let antes;

  before(async () => { socio = await titularAlAzar(admin, 'PENDIENTE'); });

  it('la administración registra en ventanilla la cuota vencida', async () => {
    antes = (await cliente(admin).get(`/pagos/socio/${socio.socio_id}/estado-cuenta`)).body;
    const vencida = antes.por_pagar.find((c) => c.estado === 'VENCIDA');
    assert.ok(vencida, 'el socio no tiene cuotas vencidas');
    const r = await cliente(admin).post('/pagos/ventanilla', { cuota_id: vencida.cuota_id, metodo: 'EFECTIVO', referencia: 'Prueba E2E' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  it('el socio ve al instante su deuda reducida en la app', async () => {
    const { body } = await cliente(socio.token).get('/pagos/estado-cuenta');
    assert.ok(body.resumen.deuda_vencida < antes.resumen.deuda_vencida,
      `deuda antes ${antes.resumen.deuda_vencida}, después ${body.resumen.deuda_vencida}`);
  });
});

describe('E2E-06 · Mantenimiento programado desde el panel bloquea la reserva en la app', () => {
  let socio;
  let franja;

  before(async () => { socio = await titularAlAzar(admin, 'AL_DIA'); });

  it('la administración bloquea por mantenimiento una franja libre del frontón', async () => {
    const fecha = hoyLima(13);
    const { body: lista } = await cliente(admin).get(`/instalaciones?fecha=${fecha}`);
    const fronton = lista.find((i) => i.codigo === 'FRONTON-1');
    const { body } = await cliente(admin).get(`/instalaciones/${fronton.id}/disponibilidad?fecha=${fecha}`);
    const libres = body.franjas.filter((f) => f.disponible);
    assert.ok(libres.length, 'sin franjas libres');
    const f = libres[libres.length - 1]; // la última del día, para no estorbar la demostración
    franja = { instalacion_id: fronton.id, fecha, hora_inicio: f.hora_inicio };
    const r = await cliente(admin).post(`/instalaciones/${fronton.id}/bloqueos`, {
      desde: `${fecha}T${f.hora_inicio}:00-05:00`, hasta: `${fecha}T${f.hora_fin}:00-05:00`, motivo: 'Prueba E2E: mantenimiento',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  it('el socio ve la franja como no disponible y no puede reservarla', async () => {
    const { body } = await cliente(socio.token).get(`/instalaciones/${franja.instalacion_id}/disponibilidad?fecha=${franja.fecha}`);
    const f = body.franjas.find((x) => x.hora_inicio === franja.hora_inicio);
    assert.equal(f.disponible, false);
    const r = await cliente(socio.token).post('/reservas', franja);
    assert.ok([409, 422].includes(r.status), `HTTP ${r.status}`);
  });
});

describe('E2E-07 · Noticia publicada desde el panel llega a la app (RF03)', () => {
  let noticia;

  it('la administración publica una noticia IMPORTANTE', async () => {
    const r = await cliente(admin).post('/noticias', {
      titulo: 'Prueba E2E: corte de agua', contenido: 'Mensaje generado por las pruebas automáticas.', categoria: 'IMPORTANTE',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    noticia = r.body;
  });

  it('el socio la ve en la app entre las importantes, arriba', async () => {
    const { body } = await cliente(await login('00247')).get('/noticias');
    const i = body.findIndex((n) => n.id === noticia.id);
    assert.ok(i >= 0, 'no aparece');
    assert.ok(body.slice(0, i).every((n) => n.categoria === 'IMPORTANTE'), 'hay noticias no importantes antes');
  });

  it('al retirarla deja de mostrarse (limpieza de la prueba)', async () => {
    assert.equal((await cliente(admin).delete(`/noticias/${noticia.id}`)).status, 204);
    const { body } = await cliente(admin).get('/noticias');
    assert.ok(!body.some((n) => n.id === noticia.id));
  });
});

describe('E2E-08 · Invitado registrado en la app ingresa con su QR', () => {
  it('el socio registra al invitado del día y la garita lo deja pasar', async () => {
    const socio = await titularAlAzar(admin, 'AL_DIA');
    const reg = await cliente(socio.token).post('/invitados', {
      dni: dniAleatorio(), nombres: 'Invitada', apellidos: 'Prueba E2E', fecha_visita: hoyLima(),
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const r = await garita({ metodo: 'QR', credencial: reg.body.qr });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.tipo, 'INVITADO');
  });
});

describe('E2E-09 · Servicios en ejecución (RNF01)', () => {
  it('la API y su conexión a la base de datos están saludables', async () => {
    const r = await solicitar('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.base_de_datos, 'ok');
  });

  it('el panel administrativo responde', { skip: !PANEL && 'PANEL_URL no definido' }, async () => {
    const r = await solicitar('GET', `${PANEL}/_stcore/health`);
    assert.equal(r.status, 200);
  });
});
