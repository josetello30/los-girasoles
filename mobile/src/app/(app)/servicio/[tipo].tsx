/**
 * Ficha de un servicio del club: posta médica, capilla o restaurante.
 * La posta y la capilla además se reservan como cualquier instalación.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import type { Instalacion, ServicioClub } from '@/api/tipos';
import { Boton, Cargando, ErrorVista, Tarjeta } from '@/componentes/basicos';
import { ImagenRemota } from '@/componentes/ImagenRemota';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, espacio, radio } from '@/tema';

const ESTILO: Record<string, { icono: keyof typeof Ionicons.glyphMap; color: string; fondo: string; accion: string }> = {
  POSTA: { icono: 'medkit', color: colores.peligro, fondo: colores.peligroSuave, accion: 'Reservar una cita' },
  CAPILLA: { icono: 'business', color: colores.azul, fondo: colores.azulSuave, accion: 'Reservar la capilla' },
  RESTAURANTE: { icono: 'restaurant', color: '#E08A00', fondo: '#FFF0D6', accion: '' },
};

export default function FichaServicio() {
  const { tipo } = useLocalSearchParams<{ tipo: string }>();
  const servicios = useConsulta<ServicioClub[]>('/servicios');
  const instalaciones = useConsulta<Instalacion[]>('/instalaciones');

  const servicio = servicios.datos?.find((s) => s.tipo === tipo);
  const instalacion = instalaciones.datos?.find((i) => i.tipo === tipo);
  const estilo = ESTILO[tipo ?? ''] ?? ESTILO.RESTAURANTE;

  return (
    <Pantalla titulo={servicio?.nombre ?? 'Servicio'}>
      {servicios.cargando && <Cargando />}
      {servicios.error && <ErrorVista mensaje={servicios.error} alReintentar={servicios.recargar} />}
      {servicio && (
        <>
          <ImagenRemota
            ruta={servicio.imagen_url}
            estilo={[e.portada, { backgroundColor: estilo.fondo }, servicio.imagen_url ? e.portadaFoto : null]}
            descripcion={`Foto de ${servicio.nombre}`}
            respaldo={<Ionicons name={estilo.icono} size={72} color={estilo.color} />}
          />
          <Tarjeta style={{ gap: espacio.m }}>
            <Texto variante="subtitulo">{servicio.nombre}</Texto>
            <Texto>{servicio.descripcion}</Texto>
            <View style={e.dato}>
              <Ionicons name="time-outline" size={18} color={colores.verde} />
              <Texto style={{ flex: 1 }}>{servicio.horario}</Texto>
            </View>
            {servicio.telefono && (
              <View style={e.dato}>
                <Ionicons name="call-outline" size={18} color={colores.verde} />
                <Texto style={{ flex: 1 }}>{servicio.telefono}</Texto>
              </View>
            )}
          </Tarjeta>

          {instalacion && estilo.accion ? (
            <Boton
              titulo={estilo.accion}
              icono="calendar"
              onPress={() => router.push({ pathname: '/reservas/[id]', params: { id: instalacion.id } })}
            />
          ) : null}
          {servicio.telefono && (
            <Boton titulo="Llamar" variante="secundario" icono="call" onPress={() => Linking.openURL(`tel:${servicio.telefono}`)} />
          )}
        </>
      )}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  portada: { height: 150, width: '100%', borderRadius: radio.m, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  portadaFoto: { height: 200 },
  dato: { flexDirection: 'row', alignItems: 'center', gap: espacio.s },
});
