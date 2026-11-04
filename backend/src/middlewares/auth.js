/**
 * Autenticación de personas (JWT) y autorización por rol.
 */
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { errores } = require('../utils/errores');

/** Firma el token de sesión con los datos mínimos para autorizar sin ir a la BD. */
function firmarToken(usuario) {
  return jwt.sign(
    {
      rol: usuario.rol,
      login: usuario.login,
      socio: usuario.socio_id || undefined,
      titular: usuario.titular_id || undefined,
      trabajador: usuario.trabajador_id || undefined,
    },
    config.jwt.secreto,
    { subject: usuario.id, expiresIn: config.jwt.expiraEn, issuer: 'girasoles-api' },
  );
}

/** Exige un 'Authorization: Bearer <token>' válido y carga req.usuario. */
function autenticar(req, _res, next) {
  const cabecera = req.get('authorization') || '';
  const [tipo, token] = cabecera.split(' ');
  if (tipo !== 'Bearer' || !token) return next(errores.noAutenticado());

  try {
    const datos = jwt.verify(token, config.jwt.secreto, { issuer: 'girasoles-api' });
    req.usuario = {
      id: datos.sub,
      rol: datos.rol,
      login: datos.login,
      socioId: datos.socio || null,
      titularId: datos.titular || null,
      trabajadorId: datos.trabajador || null,
    };
    return next();
  } catch (err) {
    const mensaje = err.name === 'TokenExpiredError'
      ? 'Tu sesión expiró, vuelve a iniciar sesión'
      : 'Token de sesión inválido';
    return next(errores.noAutenticado(mensaje));
  }
}

/** Restringe la ruta a uno o más roles: requiereRol('ADMIN', 'GUARDIA'). */
function requiereRol(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) return next(errores.noAutenticado());
    if (!roles.includes(req.usuario.rol)) return next(errores.prohibido());
    return next();
  };
}

/** Atajo: la ruta es solo para socios (necesita socioId en el token). */
function soloSocio(req, _res, next) {
  if (req.usuario?.rol !== 'SOCIO' || !req.usuario.socioId) {
    return next(errores.prohibido('Esta opción es solo para socios'));
  }
  return next();
}

module.exports = { firmarToken, autenticar, requiereRol, soloSocio };
