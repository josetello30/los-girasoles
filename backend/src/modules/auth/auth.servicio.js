/**
 * Inicio de sesión para socios (con su número de socio), administradores y guardias.
 */
'use strict';

const bcrypt = require('bcryptjs');
const db = require('../../db');
const { errores } = require('../../utils/errores');
const { firmarToken } = require('../../middlewares/auth');

// Hash ficticio: si el usuario no existe igual se ejecuta bcrypt.compare,
// así el tiempo de respuesta no revela qué logins existen.
const HASH_FICTICIO = bcrypt.hashSync('no-existe', 10);

async function buscarUsuario(login) {
  const { rows } = await db.query(
    `SELECT u.id, u.login, u.password_hash, u.rol, u.activo,
            s.id AS socio_id, COALESCE(s.titular_id, s.id) AS titular_id, s.estado AS estado_socio,
            t.id AS trabajador_id
     FROM usuario u
     LEFT JOIN socio s      ON s.usuario_id = u.id
     LEFT JOIN trabajador t ON t.usuario_id = u.id
     WHERE u.login = $1`,
    [login],
  );
  return rows[0] || null;
}

async function iniciarSesion(login, password) {
  const usuario = await buscarUsuario(login.trim());
  const coincide = await bcrypt.compare(password, usuario?.password_hash || HASH_FICTICIO);

  // Mismo mensaje para usuario inexistente y contraseña errada (no revelar cuál falló)
  if (!usuario || !coincide) throw errores.noAutenticado('Usuario o contraseña incorrectos');
  if (!usuario.activo) throw errores.prohibido('Tu cuenta está desactivada. Acércate a administración', 'CUENTA_INACTIVA');
  if (usuario.estado_socio === 'BAJA') throw errores.prohibido('Tu membresía está dada de baja', 'SOCIO_BAJA');

  await db.query('UPDATE usuario SET ultimo_login = now() WHERE id = $1', [usuario.id]);

  return {
    token: firmarToken(usuario),
    usuario: await perfil(usuario.id),
  };
}

/** Datos públicos del usuario autenticado (lo que la app muestra en el inicio). */
async function perfil(usuarioId) {
  const { rows } = await db.query(
    `SELECT u.id, u.login, u.rol, u.ultimo_login,
            sd.socio_id, sd.numero_socio, sd.tipo AS tipo_socio, sd.nombres, sd.apellidos,
            sd.lote, sd.email, sd.telefono, sd.estado_socio, sd.titular_id, sd.numero_titular,
            sd.estado_pago, sd.deuda_total, sd.deuda_vencida,
            t.id AS trabajador_id, t.cargo,
            COALESCE(sd.nombres, t.nombres) AS nombre_mostrar
     FROM usuario u
     LEFT JOIN socio s           ON s.usuario_id = u.id
     LEFT JOIN v_socio_detalle sd ON sd.socio_id = s.id
     LEFT JOIN trabajador t       ON t.usuario_id = u.id
     WHERE u.id = $1`,
    [usuarioId],
  );
  if (!rows.length) throw errores.noEncontrado('Usuario no encontrado');
  return rows[0];
}

module.exports = { iniciarSesion, perfil };
