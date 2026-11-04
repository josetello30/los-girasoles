/**
 * Rutas: /api/v1/noticias, /api/v1/eventos, /api/v1/servicios (RF03)
 */
'use strict';

const { Router } = require('express');
const db = require('../../db');
const { validar, z, uuid } = require('../../middlewares/validar');
const { requiereRol, soloSocio } = require('../../middlewares/auth');
const { errores } = require('../../utils/errores');

// ------------------------------------------------------------ noticias
const noticias = Router();

/** GET /noticias -> vigentes, las importantes primero */
noticias.get('/', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, titulo, contenido, categoria, imagen_url, publicada_en, expira_en
     FROM noticia
     WHERE publicada_en <= now() AND (expira_en IS NULL OR expira_en > now())
     ORDER BY (categoria = 'IMPORTANTE') DESC, publicada_en DESC
     LIMIT 30`,
  );
  res.json(rows);
});

const esquemaNoticia = z.object({
  titulo: z.string().trim().min(5).max(120),
  contenido: z.string().trim().min(10).max(4000),
  categoria: z.enum(['IMPORTANTE', 'MANTENIMIENTO', 'EVENTO', 'GENERAL']).default('GENERAL'),
  imagen_url: z.string().url().optional(),
  publicada_en: z.string().datetime({ offset: true }).optional(),
  expira_en: z.string().datetime({ offset: true }).optional(),
});

/** POST /noticias (admin) */
noticias.post('/', requiereRol('ADMIN'), validar({ body: esquemaNoticia }), async (req, res) => {
  const n = req.valido.body;
  const { rows } = await db.query(
    `INSERT INTO noticia (titulo, contenido, categoria, imagen_url, publicada_en, expira_en, autor_id)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7)
     RETURNING *`,
    [n.titulo, n.contenido, n.categoria, n.imagen_url || null, n.publicada_en || null, n.expira_en || null, req.usuario.id],
  );
  res.status(201).json(rows[0]);
});

/** DELETE /noticias/:id (admin) */
noticias.delete('/:id', requiereRol('ADMIN'), validar({ params: z.object({ id: uuid }) }), async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM noticia WHERE id = $1', [req.valido.params.id]);
  if (!rowCount) throw errores.noEncontrado('Noticia no encontrada');
  res.status(204).end();
});

// ------------------------------------------------------------ eventos
const eventos = Router();

/** GET /eventos -> próximos eventos con cupos e indicador de inscripción del socio */
eventos.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.id, e.titulo, e.descripcion, e.categoria, e.lugar, e.inicia_en, e.termina_en,
            e.cupo, e.costo, e.imagen_url, e.inscripciones_abiertas,
            (SELECT count(*) FROM inscripcion_evento ie WHERE ie.evento_id = e.id AND ie.estado = 'INSCRITO') AS inscritos,
            EXISTS (SELECT 1 FROM inscripcion_evento ie
                    WHERE ie.evento_id = e.id AND ie.socio_id = $1 AND ie.estado = 'INSCRITO') AS estoy_inscrito
     FROM evento e
     WHERE e.termina_en >= now()
     ORDER BY e.inicia_en`,
    [req.usuario.socioId],
  );
  res.json(rows);
});

/** POST /eventos/:id/inscripcion { disciplina? } */
eventos.post(
  '/:id/inscripcion',
  soloSocio,
  validar({
    params: z.object({ id: uuid }),
    body: z.object({ disciplina: z.string().trim().max(40).optional() }),
  }),
  async (req, res) => {
    const resultado = await db.enTransaccion(async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT id, titulo, cupo, inscripciones_abiertas, inicia_en,
                (SELECT count(*) FROM inscripcion_evento WHERE evento_id = e.id AND estado = 'INSCRITO') AS inscritos
         FROM evento e WHERE id = $1 FOR UPDATE`,
        [req.valido.params.id],
      );
      const evento = rows[0];
      if (!evento) throw errores.noEncontrado('Evento no encontrado');
      if (!evento.inscripciones_abiertas || evento.inicia_en <= new Date()) {
        throw errores.conflicto('Las inscripciones de este evento están cerradas', 'INSCRIPCION_CERRADA');
      }
      if (evento.cupo !== null && evento.inscritos >= evento.cupo) {
        throw errores.conflicto('No quedan cupos para este evento', 'SIN_CUPOS');
      }
      // Re-inscribirse después de cancelar reactiva la misma fila
      const { rows: ins } = await cliente.query(
        `INSERT INTO inscripcion_evento (evento_id, socio_id, disciplina)
         VALUES ($1, $2, $3)
         ON CONFLICT (evento_id, socio_id)
         DO UPDATE SET estado = 'INSCRITO', disciplina = EXCLUDED.disciplina, inscrito_en = now()
         WHERE inscripcion_evento.estado <> 'INSCRITO'
         RETURNING evento_id, socio_id, disciplina, estado, inscrito_en`,
        [evento.id, req.usuario.socioId, req.valido.body.disciplina || null],
      );
      if (!ins.length) throw errores.conflicto('Ya estás inscrito en este evento', 'YA_INSCRITO');
      return { ...ins[0], evento: evento.titulo };
    });
    res.status(201).json(resultado);
  },
);

/** DELETE /eventos/:id/inscripcion */
eventos.delete('/:id/inscripcion', soloSocio, validar({ params: z.object({ id: uuid }) }), async (req, res) => {
  const { rowCount } = await db.query(
    `UPDATE inscripcion_evento SET estado = 'CANCELADO'
     WHERE evento_id = $1 AND socio_id = $2 AND estado = 'INSCRITO'`,
    [req.valido.params.id, req.usuario.socioId],
  );
  if (!rowCount) throw errores.noEncontrado('No estás inscrito en este evento');
  res.status(204).end();
});

/** POST /eventos (admin) */
eventos.post(
  '/',
  requiereRol('ADMIN'),
  validar({
    body: z.object({
      titulo: z.string().trim().min(5).max(120),
      descripcion: z.string().trim().min(10).max(4000),
      categoria: z.enum(['DEPORTE', 'FESTIVAL', 'CULTURAL', 'RELIGIOSO', 'SOCIAL']),
      lugar: z.string().trim().min(3).max(80),
      inicia_en: z.string().datetime({ offset: true }),
      termina_en: z.string().datetime({ offset: true }),
      cupo: z.number().int().positive().optional(),
      costo: z.number().min(0).default(0),
      imagen_url: z.string().url().optional(),
    }),
  }),
  async (req, res) => {
    const e = req.valido.body;
    const { rows } = await db.query(
      `INSERT INTO evento (titulo, descripcion, categoria, lugar, inicia_en, termina_en, cupo, costo, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [e.titulo, e.descripcion, e.categoria, e.lugar, e.inicia_en, e.termina_en, e.cupo ?? null, e.costo, e.imagen_url || null],
    );
    res.status(201).json(rows[0]);
  },
);

// ------------------------------------------------------------ servicios
const servicios = Router();

/** GET /servicios -> posta, capilla, restaurante, administración */
servicios.get('/', async (_req, res) => {
  const { rows } = await db.query(
    'SELECT id, nombre, tipo, descripcion, horario, telefono FROM servicio_club WHERE activo ORDER BY nombre',
  );
  res.json(rows);
});

module.exports = { noticias, eventos, servicios };
