/**
 * Rutas: /api/v1/archivos  (imágenes de eventos, productos y servicios)
 *
 *   POST /archivos            (admin) cuerpo = bytes de la imagen -> { ruta }
 *   GET  /archivos/:nombre    (público) devuelve la imagen
 *
 * Las imágenes se guardan en disco (volumen Docker `girasoles-archivos`), no en
 * la BD: en la tabla solo queda la ruta relativa "archivos/<uuid>.<ext>", que
 * cada cliente completa con su propia URL de la API.
 *
 * Seguridad:
 * - Solo el administrador sube; el tipo se verifica por los primeros bytes del
 *   archivo (no se confía en el nombre ni en el Content-Type).
 * - Solo JPG, PNG o WebP de hasta 5 MB. El nombre lo genera el servidor (UUID),
 *   así que no hay forma de pisar archivos ni de recorrer directorios.
 * - La lectura es pública porque las imágenes se muestran en la app y no
 *   contienen datos personales.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const config = require('../../config/env');
const { autenticar, requiereRol } = require('../../middlewares/auth');
const { z } = require('../../middlewares/validar');
const { ErrorApi, errores } = require('../../utils/errores');

const TAMANO_MAXIMO = '5mb';
const NOMBRE_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * Valor aceptado en los campos imagen_url:
 * - una ruta devuelta por POST /archivos ("archivos/<uuid>.jpg"), o
 * - una URL https externa, o
 * - null para quitar la imagen.
 */
const esquemaImagen = z.union([
  z.string().regex(/^archivos\/[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Ruta de imagen inválida'),
  z.string().url().startsWith('https://', 'La URL de la imagen debe usar https'),
]).nullable();

/** Reconoce el formato por su "número mágico" (primeros bytes). */
function detectarFormato(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function directorio() {
  fs.mkdirSync(config.dirArchivos, { recursive: true });
  return config.dirArchivos;
}

const router = express.Router();

/** POST /archivos (admin) -> { ruta: "archivos/<uuid>.<ext>", bytes } */
router.post(
  '/',
  autenticar,
  requiereRol('ADMIN'),
  express.raw({ type: () => true, limit: TAMANO_MAXIMO }),
  async (req, res) => {
    const datos = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!datos.length) throw errores.solicitudInvalida('Envía la imagen en el cuerpo de la solicitud');
    const formato = detectarFormato(datos);
    if (!formato) {
      throw new ErrorApi(415, 'FORMATO_NO_SOPORTADO', 'Solo se aceptan imágenes JPG, PNG o WebP');
    }
    const nombre = `${crypto.randomUUID()}.${formato}`;
    await fs.promises.writeFile(path.join(directorio(), nombre), datos, { flag: 'wx' });
    res.status(201).json({ ruta: `archivos/${nombre}`, bytes: datos.length });
  },
);

/** GET /archivos/:nombre (público) */
router.get('/:nombre', (req, res, next) => {
  const { nombre } = req.params;
  if (!NOMBRE_VALIDO.test(nombre)) return next(errores.noEncontrado('Imagen no encontrada'));
  res.set({
    'Cache-Control': 'public, max-age=31536000, immutable', // el nombre nunca cambia de contenido
    'Cross-Origin-Resource-Policy': 'cross-origin', // permite mostrarla en la app web y el panel
  });
  return res.sendFile(nombre, { root: directorio(), dotfiles: 'deny' }, (err) => {
    if (err) next(err.status === 404 || err.code === 'ENOENT' ? errores.noEncontrado('Imagen no encontrada') : err);
  });
});

module.exports = { router, esquemaImagen, detectarFormato };
