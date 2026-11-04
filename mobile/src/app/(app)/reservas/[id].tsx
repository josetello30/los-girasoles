/**
 * Detalle de instalación: franjas horarias del día y confirmación de la reserva.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, ErrorApi } from '@/api/cliente';
import type { Disponibilidad, ReservaCreada } from '@/api/tipos';
import { Boton, Cargando, ErrorVista, Fila, Tarjeta } from '@/componentes/basicos';
import { ESTILO_INSTALACION } from '@/componentes/IconoInstalacion';
import { Pantalla } from '@/componentes/Pantalla';
import { SelectorFecha } from '@/componentes/SelectorFecha';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio, fuentes, radio } from '@/tema';
import { avisar, confirmar } from '@/utils/dialogos';
import { fechaConDia, fechaIso, soles } from '@/utils/formato';

export default function DetalleInstalacion() {
  const { id, fecha: fechaInicial } = useLocalSearchParams<{ id: string; fecha?: string }>();
  const { refrescarPerfil } = useSesion();
  const [fecha, setFecha] = useState(fechaInicial ?? fechaIso());
  const [hora, setHora] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { datos, cargando, error, recargar, refrescando } = useConsulta<Disponibilidad>(
    `/instalaciones/${id}/disponibilidad?fecha=${fecha}`,
  );

  const inst = datos?.instalacion;
  const estilo = inst ? ESTILO_INSTALACION[inst.tipo] : null;
  const franja = datos?.franjas.find((f) => f.hora_inicio === hora);
  const monto = inst ? (inst.tarifa_hora * inst.duracion_bloque_min) / 60 : 0;

  function cambiarFecha(f: string) {
    setFecha(f);
    setHora(null);
  }

  async function reservar() {
    if (!inst || !hora) return;
    setEnviando(true);
    try {
      const r = await api.post<ReservaCreada>('/reservas', { instalacion_id: inst.id, fecha, hora_inicio: hora });
      if (r.cuota) {
        const pagarAhora = await confirmar('¡Ya casi!', `${r.mensaje}.`, 'Pagar ahora');
        if (pagarAhora) {
          router.replace({ pathname: '/pagos/pagar', params: { cuota: r.cuota.id, monto: String(r.cuota.monto), concepto: `Reserva ${inst.nombre}` } });
        } else {
          router.replace('/reservas/mias');
        }
      } else {
        avisar('¡Reserva confirmada!', `${inst.nombre}\n${fechaConDia(fecha)} · ${hora}`);
        router.replace('/reservas/mias');
      }
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'MOROSIDAD') {
        await refrescarPerfil().catch(() => undefined);
        const irAPagar = await confirmar('Reservas bloqueadas', e.message, 'Ver mis pagos');
        if (irAPagar) router.push('/pagos');
      } else {
        avisar('No se pudo reservar', e instanceof Error ? e.message : undefined);
        if (e instanceof ErrorApi && e.estado === 409) void recargar(); // alguien tomó la franja
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla titulo={inst?.nombre ?? 'Instalación'} refrescando={refrescando} alRefrescar={recargar}>
      {estilo && inst && (
        <View style={[e.portada, { backgroundColor: estilo.fondo }]}>
          <MaterialCommunityIcons name={estilo.icono} size={72} color={estilo.color} />
          <Texto variante="pequeno" style={{ marginTop: espacio.s }}>
            {inst.tarifa_hora > 0 ? `${soles(monto)} por ${inst.duracion_bloque_min / 60} h` : 'Sin costo para socios'}
            {' · '}bloques de {inst.duracion_bloque_min >= 60 ? `${inst.duracion_bloque_min / 60} h` : `${inst.duracion_bloque_min} min`}
          </Texto>
        </View>
      )}

      <Texto variante="subtitulo" style={{ fontSize: 17 }}>Selecciona una fecha</Texto>
      <SelectorFecha seleccionada={fecha} alCambiar={cambiarFecha} />

      <Texto variante="subtitulo" style={{ fontSize: 17 }}>Horarios disponibles</Texto>
      {cargando && <Cargando />}
      {error && !datos && <ErrorVista mensaje={error} alReintentar={recargar} />}

      <View style={e.grilla}>
        {datos?.franjas.map((f) => {
          const elegida = f.hora_inicio === hora;
          return (
            <Pressable
              key={f.hora_inicio}
              disabled={!f.disponible}
              onPress={() => setHora(f.hora_inicio)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !f.disponible, selected: elegida }}
              style={[e.franja, !f.disponible && e.franjaOcupada, elegida && e.franjaElegida]}
            >
              <Texto style={[e.textoFranja, !f.disponible && e.textoOcupado, elegida && { color: colores.blanco }]}>
                {f.hora_inicio}
              </Texto>
              {f.cupos_libres !== undefined && f.disponible && (
                <Texto style={[e.cupos, elegida && { color: colores.blanco }]}>{f.cupos_libres} cupos</Texto>
              )}
            </Pressable>
          );
        })}
      </View>
      {datos && !datos.franjas.some((f) => f.disponible) && (
        <Texto variante="pequeno" style={{ textAlign: 'center' }}>No quedan horarios este día. Prueba con otra fecha.</Texto>
      )}

      {franja && inst && (
        <Tarjeta style={{ gap: espacio.s }}>
          <Texto variante="subtitulo" style={{ fontSize: 17 }}>Resumen</Texto>
          <Fila><Texto variante="pequeno">Instalación</Texto><Texto variante="etiqueta">{inst.nombre}</Texto></Fila>
          <Fila><Texto variante="pequeno">Fecha</Texto><Texto variante="etiqueta">{fechaConDia(fecha)}</Texto></Fila>
          <Fila><Texto variante="pequeno">Horario</Texto><Texto variante="etiqueta">{franja.hora_inicio} - {franja.hora_fin}</Texto></Fila>
          <Fila><Texto variante="pequeno">Total</Texto><Texto variante="etiqueta">{monto > 0 ? soles(monto) : 'Gratis'}</Texto></Fila>
          <Boton titulo={monto > 0 ? 'Reservar y pagar' : 'Confirmar reserva'} onPress={reservar} cargando={enviando} style={{ marginTop: espacio.s }} />
        </Tarjeta>
      )}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  portada: { borderRadius: radio.m, height: 150, alignItems: 'center', justifyContent: 'center' },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  franja: {
    width: '23.2%', paddingVertical: 12, borderRadius: radio.s, backgroundColor: colores.blanco,
    alignItems: 'center', borderWidth: 1, borderColor: colores.borde,
  },
  franjaOcupada: { backgroundColor: '#F1EEE4', borderColor: '#F1EEE4' },
  franjaElegida: { backgroundColor: colores.verde, borderColor: colores.verde },
  textoFranja: { fontFamily: fuentes.seminegrita, fontSize: 15 },
  textoOcupado: { color: '#BDB8A8', textDecorationLine: 'line-through' },
  cupos: { fontSize: 10.5, color: colores.textoSuave, fontFamily: fuentes.regular },
});
