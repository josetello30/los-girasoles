/**
 * Estructura común de las pantallas internas: encabezado verde con botón de
 * regreso (como en el prototipo) y contenido desplazable con "jalar para recargar".
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colores, espacio } from '@/tema';
import { Texto } from './Texto';

interface Props {
  titulo: string;
  children: ReactNode;
  /** Muestra la flecha de regreso (por defecto sí). */
  conRegreso?: boolean;
  /** Elemento a la derecha del título (ej. botón "Mis reservas"). */
  accion?: ReactNode;
  refrescando?: boolean;
  alRefrescar?: () => void;
  /** Si es false el contenido no se envuelve en ScrollView (para listas propias). */
  desplazable?: boolean;
}

export function Pantalla({ titulo, children, conRegreso = true, accion, refrescando, alRefrescar, desplazable = true }: Props) {
  const insets = useSafeAreaInsets();

  const encabezado = (
    <View style={[e.encabezado, { paddingTop: insets.top + espacio.m }]}>
      <View style={e.filaTitulo}>
        {conRegreso && (
          <Pressable accessibilityLabel="Volver" hitSlop={12} onPress={() => router.back()} style={{ marginRight: espacio.m }}>
            <Ionicons name="arrow-back" size={24} color={colores.blanco} />
          </Pressable>
        )}
        <Texto variante="subtitulo" style={{ color: colores.blanco, flex: 1, fontSize: 20 }} numberOfLines={1}>
          {titulo}
        </Texto>
        {accion}
      </View>
    </View>
  );

  return (
    <View style={e.raiz}>
      {encabezado}
      {desplazable ? (
        <ScrollView
          contentContainerStyle={e.contenido}
          refreshControl={alRefrescar ? (
            <RefreshControl refreshing={!!refrescando} onRefresh={alRefrescar} tintColor={colores.verde} colors={[colores.verde]} />
          ) : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.crema },
  encabezado: { backgroundColor: colores.verde, paddingHorizontal: espacio.l, paddingBottom: espacio.l },
  filaTitulo: { flexDirection: 'row', alignItems: 'center' },
  contenido: { padding: espacio.l, paddingBottom: espacio.xxl * 2, gap: espacio.m },
});
