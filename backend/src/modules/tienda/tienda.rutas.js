/**
 * Rutas: /api/v1/tienda  (merchandising del club, simulado)
 * El pedido genera una cuota TIENDA que se paga con POST /pagos.
 */
'use strict';

const { Router } = require('express');
const db = require('../../db');
const { validar, z, uuid } = require('../../middlewares/validar');
const { soloSocio, requiereRol } = require('../../middlewares/auth');
const { errores } = require('../../utils/errores');
const { actualizacionParcial } = require('../../utils/sql');
const { esquemaImagen } = require('../archivos/archivos.rutas');

const router = Router();

/** GET /tienda/productos */
router.get('/productos', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, sku, nombre, descripcion, categoria, precio, stock, imagen_url
     FROM producto WHERE activo ORDER BY categoria, nombre`,
  );
  res.json(rows);
});

// ------------------------------------------------------------ administración (panel)
const CAMPOS_PRODUCTO = ['sku', 'nombre', 'descripcion', 'categoria', 'precio', 'stock', 'imagen_url', 'activo'];
const esquemaProducto = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'SKU: 3 a 20 letras, números o guiones'),
  nombre: z.string().trim().min(3).max(80),
  descripcion: z.string().trim().max(500).nullable().optional(),
  categoria: z.string().trim().min(3).max(30),
  precio: z.number().positive().max(10000),
  stock: z.number().int().min(0).max(100000),
  imagen_url: esquemaImagen.optional(),
  activo: z.boolean().optional(),
});

/** GET /tienda/admin/productos (admin) -> todos, incluidos los inactivos, con unidades vendidas */
router.get('/admin/productos', requiereRol('ADMIN'), async (_req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.sku, p.nombre, p.descripcion, p.categoria, p.precio, p.stock, p.imagen_url, p.activo,
            COALESCE(SUM(d.cantidad) FILTER (WHERE pe.estado <> 'CANCELADO'), 0)::int AS vendidos
     FROM producto p
     LEFT JOIN detalle_pedido d ON d.producto_id = p.id
     LEFT JOIN pedido pe ON pe.id = d.pedido_id
     GROUP BY p.id
     ORDER BY p.activo DESC, p.categoria, p.nombre`,
  );
  res.json(rows);
});

/** POST /tienda/productos (admin) */
router.post('/productos', requiereRol('ADMIN'), validar({ body: esquemaProducto }), async (req, res) => {
  const p = req.valido.body;
  const { rows } = await db.query(
    `INSERT INTO producto (sku, nombre, descripcion, categoria, precio, stock, imagen_url, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [p.sku, p.nombre, p.descripcion ?? null, p.categoria, p.precio, p.stock, p.imagen_url ?? null, p.activo ?? true],
  );
  res.status(201).json(rows[0]);
});

/** PATCH /tienda/productos/:id (admin) -> cambia solo los campos enviados (imagen_url: null la quita) */
router.patch(
  '/productos/:id',
  requiereRol('ADMIN'),
  validar({ params: z.object({ id: uuid }), body: esquemaProducto.partial() }),
  async (req, res) => {
    const { sets, valores } = actualizacionParcial(req.valido.body, CAMPOS_PRODUCTO);
    if (!sets) throw errores.solicitudInvalida('No se envió ningún campo para actualizar');
    const { rows } = await db.query(
      `UPDATE producto SET ${sets} WHERE id = $${valores.length + 1} RETURNING *`,
      [...valores, req.valido.params.id],
    );
    if (!rows.length) throw errores.noEncontrado('Producto no encontrado');
    res.json(rows[0]);
  },
);

// ------------------------------------------------------------ pedidos (socios)
const esquemaPedido = z.object({
  items: z.array(z.object({
    producto_id: uuid,
    cantidad: z.number().int().min(1).max(10),
  })).min(1).max(20)
    .refine((items) => new Set(items.map((i) => i.producto_id)).size === items.length, {
      message: 'Hay productos repetidos en el pedido',
    }),
});

/** POST /tienda/pedidos { items: [{producto_id, cantidad}] } -> pedido + cuota por pagar */
router.post('/pedidos', soloSocio, validar({ body: esquemaPedido }), async (req, res) => {
  const { items } = req.valido.body;

  const resultado = await db.enTransaccion(async (cliente) => {
    // Bloquea los productos para que dos compras simultáneas no vendan el mismo stock
    const { rows: productos } = await cliente.query(
      `SELECT id, nombre, precio, stock FROM producto
       WHERE id = ANY($1::uuid[]) AND activo
       ORDER BY id FOR UPDATE`,
      [items.map((i) => i.producto_id)],
    );
    const porId = new Map(productos.map((p) => [p.id, p]));

    for (const item of items) {
      const p = porId.get(item.producto_id);
      if (!p) throw errores.noEncontrado('Uno de los productos no existe');
      if (p.stock < item.cantidad) {
        throw errores.conflicto(`Stock insuficiente de "${p.nombre}" (quedan ${p.stock})`, 'SIN_STOCK');
      }
    }

    const { rows: ped } = await cliente.query(
      'INSERT INTO pedido (socio_id) VALUES ($1) RETURNING id',
      [req.usuario.titularId],
    );
    const pedidoId = ped[0].id;

    for (const item of items) {
      const p = porId.get(item.producto_id);
      await cliente.query(
        'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)',
        [pedidoId, p.id, item.cantidad, p.precio],
      );
      await cliente.query('UPDATE producto SET stock = stock - $2 WHERE id = $1', [p.id, item.cantidad]);
    }

    // El total lo calcula el trigger de detalle_pedido
    const { rows: tot } = await cliente.query('SELECT total FROM pedido WHERE id = $1', [pedidoId]);
    const { rows: cuota } = await cliente.query(
      `INSERT INTO cuota (socio_id, concepto, periodo, descripcion, monto, fecha_vencimiento, pedido_id)
       VALUES ($1, 'TIENDA', date_trunc('month', CURRENT_DATE), 'Compra en tienda del club', $2, CURRENT_DATE + 1, $3)
       RETURNING id, monto`,
      [req.usuario.titularId, tot[0].total, pedidoId],
    );

    return { pedido_id: pedidoId, estado: 'PENDIENTE_PAGO', total: tot[0].total, cuota: cuota[0] };
  });

  res.status(201).json(resultado);
});

/** GET /tienda/pedidos/mios */
router.get('/pedidos/mios', soloSocio, async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.estado, p.total, p.creado_en,
            json_agg(json_build_object('producto', pr.nombre, 'cantidad', d.cantidad,
                                       'precio_unitario', d.precio_unitario) ORDER BY pr.nombre) AS items
     FROM pedido p
     JOIN detalle_pedido d ON d.pedido_id = p.id
     JOIN producto pr ON pr.id = d.producto_id
     WHERE p.socio_id = $1
     GROUP BY p.id
     ORDER BY p.creado_en DESC
     LIMIT 30`,
    [req.usuario.titularId],
  );
  res.json(rows);
});

module.exports = router;
