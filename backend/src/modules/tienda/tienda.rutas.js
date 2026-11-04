/**
 * Rutas: /api/v1/tienda  (merchandising del club, simulado)
 * El pedido genera una cuota TIENDA que se paga con POST /pagos.
 */
'use strict';

const { Router } = require('express');
const db = require('../../db');
const { validar, z, uuid } = require('../../middlewares/validar');
const { soloSocio } = require('../../middlewares/auth');
const { errores } = require('../../utils/errores');

const router = Router();

/** GET /tienda/productos */
router.get('/productos', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, sku, nombre, descripcion, categoria, precio, stock, imagen_url
     FROM producto WHERE activo ORDER BY categoria, nombre`,
  );
  res.json(rows);
});

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
