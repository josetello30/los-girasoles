/**
 * Rutas: /api/v1/nomina  (planilla simulada del personal, solo administración)
 */
'use strict';

const { Router } = require('express');
const db = require('../../db');
const { validar, z } = require('../../middlewares/validar');
const { errores } = require('../../utils/errores');

const router = Router();
const periodoParam = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato esperado: AAAA-MM'),
});

/** GET /nomina -> planillas con totales */
router.get('/', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, to_char(p.periodo, 'YYYY-MM') AS periodo, p.estado, p.generada_en, p.cerrada_en,
            count(b.id) AS trabajadores,
            COALESCE(sum(b.sueldo_base), 0)       AS total_bruto,
            COALESCE(sum(b.descuento_pension), 0) AS total_descuentos,
            COALESCE(sum(b.monto_neto), 0)        AS total_neto,
            COALESCE(sum(b.aporte_essalud), 0)    AS total_essalud
     FROM planilla p LEFT JOIN boleta b ON b.planilla_id = p.id
     GROUP BY p.id ORDER BY p.periodo DESC`,
  );
  res.json(rows);
});

/** GET /nomina/:periodo -> boletas de la planilla */
router.get('/:periodo', validar({ params: periodoParam }), async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.id, t.dni, t.nombres || ' ' || t.apellidos AS trabajador, t.cargo,
            b.regimen_pension, t.afp_nombre, b.dias_asistidos, b.sueldo_base,
            b.descuento_pension, b.monto_neto, b.aporte_essalud
     FROM planilla p
     JOIN boleta b ON b.planilla_id = p.id
     JOIN trabajador t ON t.id = b.trabajador_id
     WHERE p.periodo = ($1 || '-01')::date
     ORDER BY t.cargo, t.apellidos`,
    [req.valido.params.periodo],
  );
  if (!rows.length) throw errores.noEncontrado('No existe planilla para ese periodo');
  res.json(rows);
});

/** POST /nomina/:periodo/generar -> calcula (o recalcula un borrador) */
router.post('/:periodo/generar', validar({ params: periodoParam }), async (req, res) => {
  const { rows } = await db.query(
    'SELECT fn_generar_planilla(($1 || \'-01\')::date, $2) AS id',
    [req.valido.params.periodo, req.usuario.id],
  );
  res.status(201).json({ planilla_id: rows[0].id, periodo: req.valido.params.periodo, estado: 'BORRADOR' });
});

/** POST /nomina/:periodo/cerrar -> congela la planilla */
router.post('/:periodo/cerrar', validar({ params: periodoParam }), async (req, res) => {
  const { rows } = await db.query(
    `UPDATE planilla SET estado = 'CERRADA', cerrada_en = now()
     WHERE periodo = ($1 || '-01')::date AND estado = 'BORRADOR'
     RETURNING id, to_char(periodo, 'YYYY-MM') AS periodo, estado, cerrada_en`,
    [req.valido.params.periodo],
  );
  if (!rows.length) throw errores.conflicto('La planilla no existe o ya está cerrada', 'PLANILLA_NO_ABIERTA');
  res.json(rows[0]);
});

module.exports = router;
