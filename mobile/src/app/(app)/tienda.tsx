/**
 * Tienda del club (merchandising simulado): carrito simple y pago en línea.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/cliente';
import type { PedidoCreado, Producto } from '@/api/tipos';
import { Boton, Cargando, ErrorVista, Fila, Tarjeta } from '@/componentes/basicos';
import { ImagenRemota } from '@/componentes/ImagenRemota';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, espacio, fuentes, radio } from '@/tema';
import { avisar } from '@/utils/dialogos';
import { soles } from '@/utils/formato';

type Icono = keyof typeof MaterialCommunityIcons.glyphMap;
const ICONO_SKU: Record<string, Icono> = {
  POL: 'tshirt-crew', CAS: 'hanger', SHO: 'run', GOR: 'hat-fedora', TOA: 'beach', TOM: 'bottle-tonic', LLA: 'key-chain', TAZ: 'coffee',
};

export default function Tienda() {
  const { datos, cargando, error, recargar, refrescando } = useConsulta<Producto[]>('/tienda/productos');
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [comprando, setComprando] = useState(false);

  const total = useMemo(
    () => (datos ?? []).reduce((suma, p) => suma + (carrito[p.id] ?? 0) * p.precio, 0),
    [carrito, datos],
  );
  const unidades = Object.values(carrito).reduce((a, b) => a + b, 0);

  function cambiar(p: Producto, delta: number) {
    setCarrito((c) => {
      const nueva = Math.max(0, Math.min((c[p.id] ?? 0) + delta, Math.min(p.stock, 10)));
      const { [p.id]: _, ...resto } = c;
      return nueva === 0 ? resto : { ...resto, [p.id]: nueva };
    });
  }

  async function comprar() {
    setComprando(true);
    try {
      const items = Object.entries(carrito).map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
      const pedido = await api.post<PedidoCreado>('/tienda/pedidos', { items });
      setCarrito({});
      router.push({ pathname: '/pagos/pagar', params: { cuota: pedido.cuota.id, monto: String(pedido.total), concepto: 'Compra en la tienda del club' } });
    } catch (e) {
      avisar('No se pudo crear el pedido', e instanceof Error ? e.message : undefined);
      void recargar();
    } finally {
      setComprando(false);
    }
  }

  return (
    <Pantalla titulo="Tienda" refrescando={refrescando} alRefrescar={recargar}>
      {cargando && <Cargando />}
      {error && !datos && <ErrorVista mensaje={error} alReintentar={recargar} />}

      <View style={e.grilla}>
        {datos?.map((p) => {
          const cantidad = carrito[p.id] ?? 0;
          return (
            <Tarjeta key={p.id} style={e.producto}>
              <ImagenRemota
                ruta={p.imagen_url}
                estilo={e.imagen}
                descripcion={`Foto de ${p.nombre}`}
                respaldo={<MaterialCommunityIcons name={ICONO_SKU[p.sku.slice(0, 3)] ?? 'shopping'} size={44} color={colores.verde} />}
              />
              <Texto variante="etiqueta" numberOfLines={2} style={{ minHeight: 38 }}>{p.nombre}</Texto>
              <Texto style={{ fontFamily: fuentes.negrita, color: colores.naranja, fontSize: 16 }}>{soles(p.precio)}</Texto>
              <Texto variante="pequeno">{p.stock > 0 ? `${p.stock} disponibles` : 'Agotado'}</Texto>
              <View style={e.contador}>
                <Pressable onPress={() => cambiar(p, -1)} disabled={cantidad === 0} style={e.botonCantidad}>
                  <Texto style={e.signo}>−</Texto>
                </Pressable>
                <Texto style={{ fontFamily: fuentes.negrita, minWidth: 20, textAlign: 'center' }}>{cantidad}</Texto>
                <Pressable onPress={() => cambiar(p, 1)} disabled={cantidad >= p.stock} style={e.botonCantidad}>
                  <Texto style={e.signo}>+</Texto>
                </Pressable>
              </View>
            </Tarjeta>
          );
        })}
      </View>

      {unidades > 0 && (
        <Tarjeta style={{ gap: espacio.m }}>
          <Fila>
            <Texto variante="etiqueta">{unidades} {unidades === 1 ? 'producto' : 'productos'}</Texto>
            <Texto variante="subtitulo">{soles(total)}</Texto>
          </Fila>
          <Boton titulo="Comprar y pagar" icono="bag-check" onPress={comprar} cargando={comprando} />
          <Texto variante="pequeno" style={{ textAlign: 'center' }}>Recojo en administración. Tienda simulada con fines académicos.</Texto>
        </Tarjeta>
      )}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.m },
  producto: { width: '47.8%', gap: 4, padding: espacio.m },
  imagen: { height: 110, width: '100%', borderRadius: radio.s, backgroundColor: colores.verdeSuave, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  contador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  botonCantidad: { width: 34, height: 34, borderRadius: 17, backgroundColor: colores.verdeSuave, alignItems: 'center', justifyContent: 'center' },
  signo: { fontFamily: fuentes.negrita, fontSize: 18, color: colores.verde },
});
