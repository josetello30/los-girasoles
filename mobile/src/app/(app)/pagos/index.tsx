/**
 * Pagos y cuenta: saldo, cuota mensual, mora, cuotas por pagar e historial.
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { CuotaPendiente, EstadoCuenta } from '@/api/tipos';
import { Boton, Cargando, ErrorVista, Fila, Insignia, Tarjeta } from '@/componentes/basicos';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, espacio, fuentes, radio, sombra } from '@/tema';
import { fechaCorta, mesAnio, soles } from '@/utils/formato';

function irAPagar(c: CuotaPendiente) {
  const concepto = c.concepto === 'MANTENIMIENTO' ? `Cuota de ${mesAnio(c.periodo)}` : c.descripcion;
  router.push({ pathname: '/pagos/pagar', params: { cuota: c.cuota_id, monto: String(c.saldo), concepto } });
}

export default function Pagos() {
  const { datos, cargando, error, refrescando, recargar } = useConsulta<EstadoCuenta>('/pagos/estado-cuenta');

  if (cargando) return <Pantalla titulo="Pagos y Cuenta"><Cargando /></Pantalla>;
  if (error || !datos) {
    return <Pantalla titulo="Pagos y Cuenta"><ErrorVista mensaje={error ?? 'Sin datos'} alReintentar={recargar} /></Pantalla>;
  }

  const { resumen, por_pagar: porPagar, historial_mantenimiento: historial } = datos;
  const masAntigua = porPagar[0];

  return (
    <Pantalla titulo="Pagos y Cuenta" refrescando={refrescando} alRefrescar={recargar}>
      {/* ---------------- Saldo */}
      <View style={e.saldo}>
        <Fila>
          <Texto style={{ color: 'rgba(255,255,255,0.8)' }}>Saldo pendiente</Texto>
          <Insignia estado={resumen.estado_pago} />
        </Fila>
        <Texto style={e.monto}>{soles(resumen.deuda_total)}</Texto>
        <View style={{ flexDirection: 'row', gap: espacio.m }}>
          <View style={e.caja}>
            <Texto style={e.etiquetaCaja}>Cuota mensual</Texto>
            <Texto style={e.valorCaja}>{soles(datos.cuota_mensual)}</Texto>
          </View>
          <View style={e.caja}>
            <Texto style={e.etiquetaCaja}>Vencido</Texto>
            <Texto style={[e.valorCaja, { color: colores.amarillo }]}>{soles(resumen.deuda_vencida)}</Texto>
          </View>
        </View>
      </View>

      {masAntigua ? (
        <Boton
          icono="card"
          titulo={masAntigua.concepto === 'MANTENIMIENTO' ? `Pagar Cuota de ${mesAnio(masAntigua.periodo).split(' ')[0]}` : `Pagar ${soles(masAntigua.saldo)}`}
          onPress={() => irAPagar(masAntigua)}
        />
      ) : (
        <Tarjeta><Texto style={{ textAlign: 'center' }}>🎉 No tienes pagos pendientes</Texto></Tarjeta>
      )}

      {resumen.estado_pago === 'VENCIDO' && (
        <Texto variante="pequeno" style={{ color: colores.peligro, textAlign: 'center' }}>
          Con cuotas vencidas por más de 30 días no puedes reservar instalaciones. El ingreso al club no se restringe.
        </Texto>
      )}

      {/* ---------------- Por pagar */}
      {porPagar.length > 1 && (
        <>
          <Texto variante="subtitulo" style={{ fontSize: 17 }}>Por pagar ({porPagar.length})</Texto>
          {porPagar.map((c) => (
            <Tarjeta key={c.cuota_id} onPress={() => irAPagar(c)}>
              <Fila>
                <View style={{ flex: 1 }}>
                  <Texto variante="etiqueta">{c.concepto === 'MANTENIMIENTO' ? mesAnio(c.periodo) : c.descripcion}</Texto>
                  <Texto variante="pequeno">Vence: {fechaCorta(c.fecha_vencimiento)}{c.dias_mora > 0 ? ` · ${c.dias_mora} días de atraso` : ''}</Texto>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Texto variante="etiqueta" style={{ fontSize: 16 }}>{soles(c.saldo)}</Texto>
                  <Insignia estado={c.estado} />
                </View>
              </Fila>
            </Tarjeta>
          ))}
        </>
      )}

      {/* ---------------- Historial */}
      <Texto variante="subtitulo" style={{ fontSize: 17 }}>Historial de Pagos</Texto>
      {historial.map((h) => (
        <Tarjeta key={h.cuota_id}>
          <Fila>
            <View>
              <Texto variante="etiqueta" style={{ fontSize: 16 }}>{mesAnio(h.periodo)}</Texto>
              <Texto variante="pequeno">Vence: {fechaCorta(h.fecha_vencimiento)}</Texto>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Texto variante="etiqueta" style={{ fontSize: 16 }}>{soles(h.estado === 'PAGADA' ? h.monto : h.saldo)}</Texto>
              <Insignia estado={h.estado} />
            </View>
          </Fila>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  saldo: { backgroundColor: '#1E7A1E', borderRadius: radio.l, padding: espacio.xl, ...sombra },
  monto: { color: colores.blanco, fontFamily: fuentes.negrita, fontSize: 40, marginVertical: espacio.m },
  caja: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radio.s, padding: espacio.m },
  etiquetaCaja: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  valorCaja: { color: colores.blanco, fontFamily: fuentes.negrita, fontSize: 17, marginTop: 2 },
});
