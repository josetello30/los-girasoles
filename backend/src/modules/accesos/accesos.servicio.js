/**
 * Control de acceso (RF01, RF05, RNF02).
 *
 * Decide si una credencial (tarjeta RFID o QR dinámico) puede ingresar,
 * registra SIEMPRE el intento en log_acceso con su latencia y responde
 * en un formato compacto pensado para el LCD de 16x2 del ESP32.
 *
 * Política: la morosidad NUNCA impide el ingreso (es un club residencial).
 * Solo se deniega por credencial desconocida, bloqueada, QR vencido/usado
 * o membresía suspendida / dada de baja.
 */
'use strict';

const db = require('../../db');
const { sha256, tokenAleatorio } = require('../../utils/seguridad');
const { errores } = require('../../utils/errores');

const PREFIJO_QR = 'GIR1:';

/** Texto apto para un LCD HD44780: sin tildes y como máximo 16 caracteres. */
function paraLcd(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 16);
}

function denegar(motivo, lcd, extra = {}) {
  return { permitido: false, motivo, lcd: paraLcd(lcd), ...extra };
}

function permitir(persona, extra = {}) {
  const primerNombre = persona.nombres.split(' ')[0];
  return { permitido: true, motivo: null, lcd: paraLcd(`Hola ${primerNombre}`), ...extra };
}

// ------------------------------------------------------------ decisiones

async function decidirRfid(uid) {
  const { rows } = await db.query(
    `SELECT c.estado AS estado_credencial,
            s.id AS socio_id, s.nombres AS s_nombres, s.apellidos AS s_apellidos, s.estado AS estado_socio,
            COALESCE(s.lote, ts.lote) AS lote,
            t.id AS trabajador_id, t.nombres AS t_nombres, t.apellidos AS t_apellidos, t.activo, t.cargo
     FROM credencial_rfid c
     LEFT JOIN socio s       ON s.id = c.socio_id
     LEFT JOIN socio ts      ON ts.id = s.titular_id
     LEFT JOIN trabajador t  ON t.id = c.trabajador_id
     WHERE c.uid_tarjeta = $1`,
    [uid],
  );
  const c = rows[0];
  if (!c) return denegar('Credencial no registrada', 'No registrada');

  const sujeto = c.socio_id
    ? { socio_id: c.socio_id, persona: { nombres: c.s_nombres, apellidos: c.s_apellidos, tipo: 'SOCIO', lote: c.lote } }
    : { trabajador_id: c.trabajador_id, persona: { nombres: c.t_nombres, apellidos: c.t_apellidos, tipo: 'TRABAJADOR', cargo: c.cargo } };

  if (c.estado_credencial === 'PERDIDA') return denegar('Credencial reportada como perdida', 'Tarjeta perdida', sujeto);
  if (c.estado_credencial === 'REVOCADA') return denegar('Credencial revocada', 'Tarjeta revocada', sujeto);

  if (c.socio_id) {
    if (c.estado_socio === 'BAJA') return denegar('Socio dado de baja', 'Socio de baja', sujeto);
    if (c.estado_socio === 'SUSPENDIDO') return denegar('Socio suspendido', 'Socio suspendido', sujeto);
  } else if (!c.activo) {
    return denegar('Trabajador inactivo', 'Personal inactivo', sujeto);
  }

  return permitir(sujeto.persona, sujeto);
}

async function decidirQr(contenido) {
  if (!contenido.startsWith(PREFIJO_QR)) return denegar('QR con formato desconocido', 'QR invalido');
  const hash = sha256(contenido.slice(PREFIJO_QR.length));

  // Consumo atómico: solo una garita puede usar el QR, aunque lo lean dos a la vez.
  const { rows } = await db.query(
    `UPDATE token_qr SET usado_en = now()
     WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > now()
     RETURNING socio_id, invitado_id`,
    [hash],
  );

  if (!rows.length) {
    const { rows: previo } = await db.query(
      'SELECT socio_id, invitado_id, usado_en, expira_en FROM token_qr WHERE token_hash = $1',
      [hash],
    );
    const t = previo[0];
    if (!t) return denegar('QR no registrado', 'QR invalido');
    const sujeto = { socio_id: t.socio_id || undefined, invitado_id: t.invitado_id || undefined };
    if (t.usado_en) return denegar('QR ya utilizado', 'QR ya usado', sujeto);
    return denegar('QR expirado', 'QR expirado', sujeto);
  }

  const token = rows[0];
  if (token.socio_id) {
    const { rows: s } = await db.query(
      `SELECT s.nombres, s.apellidos, s.estado, COALESCE(s.lote, t.lote) AS lote
       FROM socio s JOIN socio t ON t.id = COALESCE(s.titular_id, s.id) WHERE s.id = $1`,
      [token.socio_id],
    );
    const socio = s[0];
    const sujeto = { socio_id: token.socio_id, persona: { nombres: socio.nombres, apellidos: socio.apellidos, tipo: 'SOCIO', lote: socio.lote } };
    if (socio.estado !== 'ACTIVO') return denegar(`Socio ${socio.estado.toLowerCase()}`, 'Socio no activo', sujeto);
    return permitir(sujeto.persona, sujeto);
  }

  // Invitado: solo el día de su visita
  const { rows: i } = await db.query(
    `SELECT i.nombres, i.apellidos, i.fecha_visita = (now() AT TIME ZONE 'America/Lima')::date AS es_hoy,
            s.nombres || ' ' || s.apellidos AS anfitrion, COALESCE(s.lote, t.lote) AS lote
     FROM invitado i
     JOIN socio s ON s.id = i.socio_anfitrion_id
     JOIN socio t ON t.id = COALESCE(s.titular_id, s.id)
     WHERE i.id = $1`,
    [token.invitado_id],
  );
  const inv = i[0];
  const sujeto = {
    invitado_id: token.invitado_id,
    persona: { nombres: inv.nombres, apellidos: inv.apellidos, tipo: 'INVITADO', anfitrion: inv.anfitrion, lote: inv.lote },
  };
  if (!inv.es_hoy) return denegar('Invitación para otra fecha', 'Fecha no valida', sujeto);
  return permitir(sujeto.persona, sujeto);
}

// ------------------------------------------------------------ API pública

/**
 * Valida un intento de acceso y lo registra.
 * @param {object} p
 * @param {object} p.punto     punto_acceso (id, codigo)
 * @param {'RFID'|'QR'|'MANUAL'} p.metodo
 * @param {string} p.credencial  UID de la tarjeta o contenido del QR
 * @param {'ENTRADA'|'SALIDA'} p.direccion
 */
async function validar({ punto, metodo, credencial, direccion }) {
  const inicio = process.hrtime.bigint();

  const decision = metodo === 'QR'
    ? await decidirQr(credencial.trim())
    : await decidirRfid(credencial.trim().toUpperCase());

  const latenciaMs = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);

  // En el log no se guarda el token QR completo: solo un prefijo identificable.
  const credencialLog = metodo === 'QR'
    ? `qr:${credencial.replace(PREFIJO_QR, '').slice(0, 10)}`
    : credencial.trim().toUpperCase().slice(0, 64);

  const { rows } = await db.query(
    `INSERT INTO log_acceso (punto_acceso_id, socio_id, trabajador_id, invitado_id, metodo,
                             credencial_leida, direccion, resultado, motivo, latencia_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, ocurrido_en`,
    [punto.id, decision.socio_id || null, decision.trabajador_id || null, decision.invitado_id || null,
      metodo, credencialLog, direccion, decision.permitido ? 'PERMITIDO' : 'DENEGADO',
      decision.motivo, latenciaMs],
  );

  return {
    permitido: decision.permitido,
    mensaje: decision.lcd,          // texto corto para el LCD (máx. 16 caracteres)
    motivo: decision.motivo,        // texto completo para el panel
    persona: decision.persona
      ? `${decision.persona.nombres} ${decision.persona.apellidos}`
      : null,
    tipo: decision.persona?.tipo || 'DESCONOCIDO',
    lote: decision.persona?.lote || null,
    punto_acceso: punto.codigo,
    registro_id: rows[0].id,
    ocurrido_en: rows[0].ocurrido_en,
    latencia_ms: latenciaMs,
  };
}

/** Genera el QR dinámico del socio (RF01): un solo uso, vence en N segundos. */
async function generarQrSocio(socioId) {
  const vigencia = Number(await db.parametro('qr_vigencia_segundos'));
  const token = tokenAleatorio();
  const { rows } = await db.query(
    `INSERT INTO token_qr (socio_id, token_hash, expira_en)
     VALUES ($1, $2, now() + make_interval(secs => $3))
     RETURNING emitido_en, expira_en`,
    [socioId, sha256(token), vigencia],
  );
  return { qr: `${PREFIJO_QR}${token}`, vigencia_segundos: vigencia, ...rows[0] };
}

/** Crea un QR para un invitado, válido hasta el fin del día de la visita. */
async function generarQrInvitado(cliente, invitadoId, fechaVisita) {
  const token = tokenAleatorio();
  const { rows } = await cliente.query(
    `INSERT INTO token_qr (invitado_id, token_hash, expira_en)
     VALUES ($1, $2, (($3::date + 1)::timestamp AT TIME ZONE 'America/Lima'))
     RETURNING expira_en`,
    [invitadoId, sha256(token), fechaVisita],
  );
  return { qr: `${PREFIJO_QR}${token}`, expira_en: rows[0].expira_en };
}

async function puntoPorCodigo(codigo) {
  const { rows } = await db.query(
    'SELECT id, codigo, nombre, tipo FROM punto_acceso WHERE codigo = $1 AND activo',
    [codigo],
  );
  if (!rows.length) throw errores.noEncontrado('Punto de acceso no encontrado');
  return rows[0];
}

/** Registro en vivo de accesos (panel y garita). */
async function recientes({ limite, resultado, tipo_persona, punto }) {
  const { rows } = await db.query(
    `SELECT id, ocurrido_en, punto_acceso, tipo_persona, persona, referencia, lote,
            metodo, direccion, resultado, motivo, latencia_ms
     FROM v_accesos_detalle
     WHERE ($2::text IS NULL OR resultado::text = $2)
       AND ($3::text IS NULL OR tipo_persona = $3)
       AND ($4::text IS NULL OR punto_acceso = $4)
     ORDER BY ocurrido_en DESC
     LIMIT $1`,
    [limite, resultado || null, tipo_persona || null, punto || null],
  );
  return rows;
}

module.exports = { validar, generarQrSocio, generarQrInvitado, puntoPorCodigo, recientes, paraLcd, PREFIJO_QR };
