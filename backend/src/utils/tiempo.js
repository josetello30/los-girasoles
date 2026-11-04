/**
 * Fechas en la zona horaria del club (America/Lima, UTC-5 sin horario de verano).
 * El servidor puede correr en UTC: nunca usamos new Date().getDate() directamente.
 */
'use strict';

const ZONA = 'America/Lima';

/** 'YYYY-MM-DD' de hoy en Lima. */
function hoyLima(fecha = new Date()) {
  // en-CA produce el formato ISO YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(fecha);
}

/** Suma días a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'. */
function sumarDias(fechaIso, dias) {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Primer día del mes ('YYYY-MM-01') a partir de 'YYYY-MM' o 'YYYY-MM-DD'. */
function inicioMes(texto) {
  return `${texto.slice(0, 7)}-01`;
}

module.exports = { ZONA, hoyLima, sumarDias, inicioMes };
