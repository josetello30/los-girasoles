/**
 * Errores de la aplicación y traducción de errores de PostgreSQL a HTTP.
 */
'use strict';

class ErrorApi extends Error {
  /**
   * @param {number} estado  código HTTP
   * @param {string} codigo  identificador estable para el frontend (ej. 'RESERVA_SOLAPADA')
   * @param {string} mensaje texto en español para mostrar al usuario
   * @param {object} [detalles]
   */
  constructor(estado, codigo, mensaje, detalles) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const errores = {
  solicitudInvalida: (msg, det) => new ErrorApi(400, 'SOLICITUD_INVALIDA', msg, det),
  noAutenticado: (msg = 'Debes iniciar sesión') => new ErrorApi(401, 'NO_AUTENTICADO', msg),
  prohibido: (msg = 'No tienes permiso para esta acción', codigo = 'PROHIBIDO') => new ErrorApi(403, codigo, msg),
  noEncontrado: (msg = 'Recurso no encontrado') => new ErrorApi(404, 'NO_ENCONTRADO', msg),
  conflicto: (msg, codigo = 'CONFLICTO') => new ErrorApi(409, codigo, msg),
  noProcesable: (msg, codigo = 'NO_PROCESABLE') => new ErrorApi(422, codigo, msg),
};

/**
 * Códigos SQLSTATE propios definidos en database/init/03_funciones.sql
 * y algunos estándar de PostgreSQL.
 */
const MAPA_PG = {
  GR001: [409, 'INSTALACION_INACTIVA'],
  GR002: [422, 'FUERA_DE_HORARIO'],
  GR003: [422, 'RESERVA_CRUZA_DIA'],
  GR004: [409, 'INSTALACION_BLOQUEADA'],
  GR005: [409, 'AFORO_COMPLETO'],
  GR010: [422, 'CUOTA_NO_TITULAR'],
  GR011: [409, 'PAGO_EXCEDE_SALDO'],
  GR012: [409, 'CUOTA_ANULADA'],
  GR020: [409, 'PLANILLA_CERRADA'],
  '23P01': [409, 'RESERVA_SOLAPADA', 'Ese horario acaba de ser reservado por otro socio'],
  '23505': [409, 'DUPLICADO', 'El registro ya existe'],
  '23503': [422, 'REFERENCIA_INVALIDA', 'Se hace referencia a un registro que no existe'],
  '23514': [422, 'DATO_INVALIDO', 'Algún dato no cumple las reglas de validación'],
  '22P02': [400, 'FORMATO_INVALIDO', 'Formato de dato inválido'],
};

/** Convierte un error de `pg` en ErrorApi si lo reconoce; si no, devuelve null. */
function desdePostgres(err) {
  const mapeo = err && MAPA_PG[err.code];
  if (!mapeo) return null;
  const [estado, codigo, mensajeFijo] = mapeo;
  // Los GRxxx ya traen un mensaje en español escrito para el usuario.
  return new ErrorApi(estado, codigo, mensajeFijo || err.message);
}

module.exports = { ErrorApi, errores, desdePostgres };
