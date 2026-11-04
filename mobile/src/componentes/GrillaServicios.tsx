/**
 * Grilla de "Servicios del Club" (inicio y pestaña Servicios del prototipo).
 */
import { Ionicons } from '@expo/vector-icons';
import { Href, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colores, espacio, fuentes, radio, sombra } from '@/tema';
import { Texto } from './Texto';

export interface Servicio {
  titulo: string;
  subtitulo: string;
  icono: keyof typeof Ionicons.glyphMap;
  color: string;
  fondo: string;
  ruta: Href;
}

export const SERVICIOS: Servicio[] = [
  { titulo: 'Reservas', subtitulo: 'Canchas y piscina', icono: 'calendar', color: colores.verde, fondo: colores.verdeSuave, ruta: '/reservas' },
  { titulo: 'Pagos', subtitulo: 'Cuotas y estado', icono: 'card', color: colores.naranja, fondo: colores.naranjaSuave, ruta: '/pagos' },
  { titulo: 'Eventos', subtitulo: 'Festividades', icono: 'calendar-number', color: colores.morado, fondo: colores.moradoSuave, ruta: '/eventos' },
  { titulo: 'Posta', subtitulo: 'Atención primaria', icono: 'medkit', color: colores.peligro, fondo: colores.peligroSuave, ruta: '/servicio/POSTA' },
  { titulo: 'Restaurante', subtitulo: 'Menú del día', icono: 'restaurant', color: '#E08A00', fondo: '#FFF0D6', ruta: '/servicio/RESTAURANTE' },
  { titulo: 'Tienda', subtitulo: 'Merchandising', icono: 'storefront', color: colores.verde, fondo: colores.verdeSuave, ruta: '/tienda' },
  { titulo: 'Capilla', subtitulo: 'Servicios religiosos', icono: 'business', color: colores.azul, fondo: colores.azulSuave, ruta: '/servicio/CAPILLA' },
  { titulo: 'Invitados', subtitulo: 'Registra tus visitas', icono: 'people', color: '#00897B', fondo: '#DDF3F0', ruta: '/invitados' },
];

/** Variante compacta: 4 columnas con ícono y título (pantalla de inicio). */
export function GrillaCompacta({ servicios = SERVICIOS }: { servicios?: Servicio[] }) {
  return (
    <View style={e.grilla}>
      {servicios.map((s) => (
        <Pressable
          key={s.titulo}
          accessibilityRole="button"
          onPress={() => router.push(s.ruta)}
          style={({ pressed }) => [e.celdaCompacta, pressed && { opacity: 0.8 }]}
        >
          <View style={[e.icono, { backgroundColor: s.fondo }]}>
            <Ionicons name={s.icono} size={24} color={s.color} />
          </View>
          <Texto style={e.tituloCompacto} numberOfLines={1}>{s.titulo}</Texto>
        </Pressable>
      ))}
    </View>
  );
}

/** Variante amplia: 2 columnas con subtítulo (pestaña Servicios). */
export function GrillaAmplia() {
  return (
    <View style={e.grilla}>
      {SERVICIOS.map((s) => (
        <Pressable
          key={s.titulo}
          accessibilityRole="button"
          onPress={() => router.push(s.ruta)}
          style={({ pressed }) => [e.celdaAmplia, pressed && { opacity: 0.8 }]}
        >
          <View style={[e.icono, { backgroundColor: s.fondo, marginBottom: espacio.m }]}>
            <Ionicons name={s.icono} size={24} color={s.color} />
          </View>
          <Texto variante="etiqueta" style={{ fontSize: 16 }}>{s.titulo}</Texto>
          <Texto variante="pequeno">{s.subtitulo}</Texto>
        </Pressable>
      ))}
    </View>
  );
}

const e = StyleSheet.create({
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.m },
  // 4 columnas: 4 x 22 % + 3 espacios de 12 px caben en pantallas desde 320 px de ancho.
  // Sin alto fijo: el texto define la altura y no se corta.
  celdaCompacta: {
    width: '22%', backgroundColor: colores.blanco, borderRadius: radio.m,
    alignItems: 'center', justifyContent: 'center', paddingVertical: espacio.m, paddingHorizontal: 4, ...sombra,
  },
  celdaAmplia: {
    width: '47%', backgroundColor: colores.blanco, borderRadius: radio.m, padding: espacio.l, ...sombra,
  },
  icono: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tituloCompacto: { fontFamily: fuentes.seminegrita, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
});
