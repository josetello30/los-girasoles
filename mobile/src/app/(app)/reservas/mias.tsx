/**
 * Mis reservas: vigentes (con opción de pagar o cancelar) e historial.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/cliente';
import type { MiReserva } from '@/api/tipos';
import { Boton, Cargando, ErrorVista, Fila, Insignia, Tarjeta, Vacio } from '@/componentes/basicos';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, espacio, fuentes, radio } from '@/tema';
import { avisar, confirmar } from '@/utils/dialogos';
import { fechaConDia, fechaIso, soles } from '@/utils/formato';

export default function MisReservas() {
  const [vigentes, setVigentes] = useState(true);
  const { datos, cargando, error, refrescando, recargar } = useConsulta<MiReserva[]>(`/reservas/mias?vigentes=${vigentes}`);
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function cancelar(r: MiReserva) {
    const ok = await confirmar('¿Cancelar reserva?', `${r.instalacion}\n${fechaConDia(r.fecha)} · ${r.hora_inicio}`, 'Sí, cancelar');
    if (!ok) return;
    setCancelando(r.id);
    try {
      const res = await api.delete<{ mensaje: string }>(`/reservas/${r.id}`);
      avisar(res.mensaje);
      await recargar();
    } catch (e) {
      avisar('No se pudo cancelar', e instanceof Error ? e.message : undefined);
    } finally {
      setCancelando(null);
    }
  }

  return (
    <Pantalla titulo="Mis Reservas" refrescando={refrescando} alRefrescar={recargar}>
      <View style={e.pestanas}>
        {[true, false].map((v) => (
          <Pressable key={String(v)} onPress={() => setVigentes(v)} style={[e.pestana, vigentes === v && e.pestanaActiva]}>
            <Texto style={[e.textoPestana, vigentes === v && { color: colores.blanco }]}>{v ? 'Próximas' : 'Historial'}</Texto>
          </Pressable>
        ))}
      </View>

      {cargando && <Cargando />}
      {error && !datos && <ErrorVista mensaje={error} alReintentar={recargar} />}
      {datos?.length === 0 && (
        <>
          <Vacio icono="calendar-outline" texto={vigentes ? 'No tienes reservas próximas' : 'Aún no tienes reservas'} />
          {vigentes && <Boton titulo="Reservar una instalación" onPress={() => router.replace('/reservas')} />}
        </>
      )}

      {datos?.map((r) => {
        const pendientePago = r.estado === 'PENDIENTE' && r.cuota_id && (r.saldo_pendiente ?? 0) > 0;
        const cancelable = (r.estado === 'PENDIENTE' || r.estado === 'CONFIRMADA') && vigentes;
        return (
          <Tarjeta key={r.id} style={{ gap: 6 }}>
            <Fila>
              <Texto variante="etiqueta" style={{ fontSize: 17 }}>{r.instalacion}</Texto>
              <Insignia estado={r.estado} />
            </Fila>
            <View style={e.dato}>
              <Ionicons name="calendar-outline" size={16} color={colores.azul} />
              <Texto variante="pequeno" style={{ fontSize: 14 }}>
                {r.fecha === fechaIso() ? 'Hoy, ' : ''}{fechaConDia(r.fecha)}
              </Texto>
            </View>
            <View style={e.dato}>
              <Ionicons name="time-outline" size={16} color={colores.texto} />
              <Texto variante="pequeno" style={{ fontSize: 14 }}>{r.hora_inicio} - {r.hora_fin}</Texto>
            </View>
            {(pendientePago || cancelable) && (
              <View style={e.acciones}>
                {pendientePago && (
                  <Boton
                    titulo={`Pagar ${soles(r.saldo_pendiente)}`}
                    style={{ flex: 1, minHeight: 42 }}
                    onPress={() => router.push({
                      pathname: '/pagos/pagar',
                      params: { cuota: r.cuota_id!, monto: String(r.saldo_pendiente), concepto: `Reserva ${r.instalacion}` },
                    })}
                  />
                )}
                {cancelable && (
                  <Pressable onPress={() => cancelar(r)} disabled={cancelando === r.id} style={e.cancelar}>
                    <Texto style={{ color: colores.peligro, fontFamily: fuentes.seminegrita }}>
                      {cancelando === r.id ? 'Cancelando...' : 'Cancelar'}
                    </Texto>
                  </Pressable>
                )}
              </View>
            )}
          </Tarjeta>
        );
      })}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  pestanas: { flexDirection: 'row', backgroundColor: colores.cremaOscura, borderRadius: radio.s, padding: 4 },
  pestana: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  pestanaActiva: { backgroundColor: colores.verde },
  textoPestana: { fontFamily: fuentes.seminegrita, color: colores.textoSuave },
  dato: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginTop: espacio.s },
  cancelar: { paddingVertical: 10, paddingHorizontal: espacio.l, borderRadius: radio.s, borderWidth: 1, borderColor: colores.peligroSuave },
});
