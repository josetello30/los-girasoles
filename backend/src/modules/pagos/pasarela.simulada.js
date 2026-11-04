/**
 * PASARELA DE PAGOS SIMULADA (entorno académico).
 *
 * Imita el comportamiento de una pasarela real en modo de pruebas (como Culqi o
 * Niubiz sandbox): valida el formato, responde aprobado o rechazado según el
 * número de prueba y devuelve un código de operación. NO procesa dinero real
 * y NO almacena números de tarjeta: solo se guardan los 4 últimos dígitos.
 *
 * Tarjetas de prueba:
 *   4111 1111 1111 1111 -> aprobada
 *   4000 0000 0000 0002 -> rechazada: fondos insuficientes
 *   4000 0000 0000 0069 -> rechazada: tarjeta vencida
 *   Cualquier otra con dígito verificador (Luhn) válido -> aprobada
 * Yape / Plin: celular de 9 dígitos que empiece en 9 y código de aprobación de 6 dígitos.
 *   Código 000000 -> rechazado: código inválido o expirado
 */
'use strict';

const crypto = require('node:crypto');

const DEMORA_MS = Number(process.env.PASARELA_DEMORA_MS ?? 400);

const RECHAZOS = {
  '4000000000000002': 'Fondos insuficientes',
  '4000000000000069': 'Tarjeta vencida',
};

/** Algoritmo de Luhn: detecta números de tarjeta mal digitados. */
function luhnValido(numero) {
  let suma = 0;
  let doble = false;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let d = Number(numero[i]);
    if (doble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    doble = !doble;
  }
  return suma % 10 === 0;
}

function referencia(prefijo) {
  return `${prefijo}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @returns {Promise<{aprobado: boolean, referencia?: string, motivo?: string, detalle?: string}>}
 */
async function procesar({ metodo, tarjeta, billetera }) {
  if (DEMORA_MS > 0) await esperar(DEMORA_MS); // latencia típica de una pasarela

  if (metodo === 'TARJETA') {
    const numero = String(tarjeta?.numero || '').replace(/\s|-/g, '');
    if (!/^\d{15,16}$/.test(numero) || !luhnValido(numero)) {
      return { aprobado: false, motivo: 'Número de tarjeta inválido' };
    }
    const [mes, anio] = String(tarjeta.vencimiento || '').split('/').map(Number);
    const vence = new Date(2000 + anio, mes, 1); // primer día del mes siguiente
    if (!mes || mes > 12 || vence <= new Date()) {
      return { aprobado: false, motivo: 'Tarjeta vencida' };
    }
    if (RECHAZOS[numero]) return { aprobado: false, motivo: RECHAZOS[numero] };
    return { aprobado: true, referencia: referencia('TRX'), detalle: `Tarjeta •••• ${numero.slice(-4)}` };
  }

  if (metodo === 'YAPE_PLIN') {
    const celular = String(billetera?.celular || '');
    const codigo = String(billetera?.codigo_aprobacion || '');
    if (!/^9\d{8}$/.test(celular)) return { aprobado: false, motivo: 'Número de celular inválido' };
    if (!/^\d{6}$/.test(codigo) || codigo === '000000') {
      return { aprobado: false, motivo: 'Código de aprobación inválido o expirado' };
    }
    return { aprobado: true, referencia: referencia('YP'), detalle: `Billetera ***${celular.slice(-3)}` };
  }

  return { aprobado: false, motivo: 'Método de pago no soportado en línea' };
}

module.exports = { procesar, luhnValido };
