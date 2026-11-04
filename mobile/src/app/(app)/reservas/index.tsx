/**
 * Reservas: instalaciones disponibles en el día elegido (RF02).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Instalacion } from '@/api/tipos';
import { Cargando, ErrorVista, Insignia } from '@/componentes/basicos';
import { IconoInstalacion } from '@/componentes/IconoInstalacion';
import { Pantalla } from '@/componentes/Pantalla';
import { SelectorFecha } from '@/componentes/SelectorFecha';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, espacio, fuentes, radio, sombra } from '@/tema';
import { fechaCorta, fechaIso } from '@/utils/formato';

export default function Reservas() {
  const [fecha, setFecha] = useState(fechaIso());
  const { datos, cargando, error, refrescando, recargar } = useConsulta<Instalacion[]>(`/instalaciones?fecha=${fecha}`);

  return (
    <Pantalla
      titulo="Reservas"
      refrescando={refrescando}
      alRefrescar={recargar}
      accion={(
        <Pressable onPress={() => router.push('/reservas/mias')} style={e.botonMias} accessibilityRole="button">
          <Texto style={{ color: colores.blanco, fontFamily: fuentes.seminegrita, fontSize: 13 }}>Mis Reservas</Texto>
        </Pressable>
      )}
    >
      <SelectorFecha seleccionada={fecha} alCambiar={setFecha} />
      <Texto variante="subtitulo" style={{ fontSize: 17 }}>Instalaciones disponibles · {fechaCorta(fecha)}</Texto>

      {cargando && <Cargando />}
      {error && !datos && <ErrorVista mensaje={error} alReintentar={recargar} />}

      {datos?.map((inst) => {
        const libre = inst.estado === 'LIBRE';
        return (
          <Pressable
            key={inst.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/reservas/[id]', params: { id: inst.id, fecha } })}
            style={({ pressed }) => [e.fila, !libre && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}
          >
            <IconoInstalacion tipo={inst.tipo} />
            <View style={{ flex: 1, padding: espacio.l }}>
              <Texto variante="etiqueta" style={{ fontSize: 16 }}>{inst.nombre}</Texto>
              <Texto variante="pequeno">
                {inst.estado === 'MANTENIMIENTO'
                  ? 'Cerrada por mantenimiento'
                  : inst.horarios_disponibles > 0
                    ? `${inst.horarios_disponibles} ${inst.horarios_disponibles === 1 ? 'horario disponible' : 'horarios disponibles'}`
                    : 'Sin disponibilidad'}
                {inst.tarifa_hora > 0 ? ` · S/ ${inst.tarifa_hora}/h` : ' · Gratis'}
              </Texto>
            </View>
            <View style={{ paddingRight: espacio.l }}><Insignia estado={inst.estado} /></View>
          </Pressable>
        );
      })}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  fila: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colores.blanco, borderRadius: radio.m,
    overflow: 'hidden', ...sombra,
  },
  botonMias: {
    backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: espacio.m, paddingVertical: 8, borderRadius: radio.s,
  },
});
