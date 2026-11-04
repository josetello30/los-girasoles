/**
 * Formatos para Perú: soles y fechas en español, en hora de Lima.
 */
const ZONA = 'America/Lima';

export function soles(monto: number | null | undefined): string {
  return `S/ ${(monto ?? 0).toFixed(2)}`;
}

/** 'YYYY-MM-DD' de hoy (o desplazado n días) en hora de Lima. */
export function fechaIso(desplazamientoDias = 0): string {
  const d = new Date(Date.now() + desplazamientoDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
}

/** Interpreta 'YYYY-MM-DD' como mediodía en Lima (evita saltos de día por zona horaria). */
function desdeIso(fecha: string): Date {
  return new Date(`${fecha.slice(0, 10)}T12:00:00-05:00`);
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function diaSemana(fecha: string): string {
  return DIAS[desdeIso(fecha).getUTCDay()];
}

export function diaDelMes(fecha: string): number {
  return Number(fecha.slice(8, 10));
}

/** '15 ene' */
export function fechaCorta(fecha: string): string {
  const d = desdeIso(fecha);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** 'Mié 15 ene' */
export function fechaConDia(fecha: string): string {
  return `${diaSemana(fecha)} ${fechaCorta(fecha)}`;
}

/** 'Enero 2026' a partir de '2026-01-01' */
export function mesAnio(fecha: string): string {
  const d = desdeIso(fecha);
  return `${MESES_LARGOS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Fecha y hora de una marca ISO (timestamptz) en hora de Lima: '15 ene, 18:30' */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat('es-PE', {
    timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return partes.replace('.', '');
}

export function saludo(): string {
  const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', hour12: false }).format(new Date()));
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
