/**
 * Componentes básicos reutilizables: tarjeta, botón, insignia de estado,
 * campo de texto y estados de carga / error / vacío.
 */
import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';

import { colores, espacio, fuentes, radio, sombra } from '@/tema';
import { Texto } from './Texto';

// ------------------------------------------------------------ Tarjeta
export function Tarjeta({ children, style, onPress }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void;
}) {
  if (!onPress) return <View style={[e.tarjeta, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }, style]}>
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------ Botón
type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'texto';

export function Boton({ titulo, onPress, variante = 'primario', cargando, deshabilitado, icono, style }: {
  titulo: string;
  onPress: () => void;
  variante?: VarianteBoton;
  cargando?: boolean;
  deshabilitado?: boolean;
  icono?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const inactivo = deshabilitado || cargando;
  const fondo = { primario: colores.naranja, secundario: colores.verde, peligro: colores.peligro, texto: 'transparent' }[variante];
  const colorTexto = variante === 'texto' ? colores.verde : colores.blanco;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        e.boton,
        { backgroundColor: fondo },
        variante === 'primario' && e.botonSombra,
        (pressed || inactivo) && { opacity: inactivo ? 0.5 : 0.85 },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colorTexto} />
      ) : (
        <View style={e.filaCentro}>
          {icono && <Ionicons name={icono} size={18} color={colorTexto} style={{ marginRight: 8 }} />}
          <Texto style={{ color: colorTexto, fontFamily: fuentes.negrita, fontSize: 16 }}>{titulo}</Texto>
        </View>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------ Insignia de estado
const PALETA_INSIGNIA: Record<string, [string, string]> = {
  // [fondo, texto]
  AL_DIA: [colores.exito, colores.blanco],
  PAGADA: [colores.exito, colores.blanco],
  CONFIRMADA: [colores.exito, colores.blanco],
  COMPLETADA: [colores.verdeSuave, colores.verde],
  LIBRE: [colores.verdeSuave, colores.exito],
  ACTIVA: [colores.verdeSuave, colores.exito],
  ACTIVO: [colores.verdeSuave, colores.exito],
  PENDIENTE: [colores.amarillo, colores.texto],
  VENCIDO: [colores.peligro, colores.blanco],
  VENCIDA: [colores.peligro, colores.blanco],
  LLENO: [colores.peligroSuave, colores.peligro],
  CANCELADA: [colores.cremaOscura, colores.textoSuave],
  PERDIDA: [colores.peligroSuave, colores.peligro],
  REVOCADA: [colores.peligroSuave, colores.peligro],
  MANTENIMIENTO: [colores.naranjaSuave, colores.naranja],
};

const TEXTO_INSIGNIA: Record<string, string> = {
  AL_DIA: 'Al día', PAGADA: 'Pagado', CONFIRMADA: 'Confirmada', COMPLETADA: 'Completada', LIBRE: 'Libre',
  ACTIVA: 'Activa', ACTIVO: 'Activo', PENDIENTE: 'Pendiente', VENCIDO: 'Vencido', VENCIDA: 'Vencida',
  LLENO: 'Lleno', CANCELADA: 'Cancelada', PERDIDA: 'Perdida', REVOCADA: 'Revocada', MANTENIMIENTO: 'Mantenimiento',
};

export function Insignia({ estado, texto }: { estado: string; texto?: string }) {
  const [fondo, color] = PALETA_INSIGNIA[estado] ?? [colores.cremaOscura, colores.texto];
  return (
    <View style={[e.insignia, { backgroundColor: fondo }]}>
      <Texto style={{ color, fontFamily: fuentes.negrita, fontSize: 11.5 }}>{texto ?? TEXTO_INSIGNIA[estado] ?? estado}</Texto>
    </View>
  );
}

// ------------------------------------------------------------ Campo de texto
export function Campo({ etiqueta, error, ...props }: TextInputProps & { etiqueta: string; error?: string }) {
  return (
    <View style={{ marginBottom: espacio.l }}>
      <Texto variante="etiqueta" style={{ marginBottom: 6 }}>{etiqueta}</Texto>
      <TextInput
        placeholderTextColor="#B5AD8E"
        {...props}
        style={[e.campo, error ? { borderColor: colores.peligro } : null, props.style]}
      />
      {error ? <Texto variante="pequeno" style={{ color: colores.peligro, marginTop: 4 }}>{error}</Texto> : null}
    </View>
  );
}

// ------------------------------------------------------------ Estados de pantalla
export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <View style={e.centro}>
      <ActivityIndicator size="large" color={colores.verde} />
      <Texto variante="pequeno" style={{ marginTop: espacio.m }}>{texto}</Texto>
    </View>
  );
}

export function ErrorVista({ mensaje, alReintentar }: { mensaje: string; alReintentar?: () => void }) {
  return (
    <View style={e.centro}>
      <Ionicons name="cloud-offline-outline" size={48} color={colores.textoSuave} />
      <Texto style={{ textAlign: 'center', marginVertical: espacio.m }}>{mensaje}</Texto>
      {alReintentar && <Boton titulo="Reintentar" variante="secundario" onPress={alReintentar} />}
    </View>
  );
}

export function Vacio({ icono = 'file-tray-outline', texto }: { icono?: keyof typeof Ionicons.glyphMap; texto: string }) {
  return (
    <View style={[e.centro, { paddingVertical: espacio.xxl }]}>
      <Ionicons name={icono} size={42} color={colores.textoSuave} />
      <Texto variante="pequeno" style={{ marginTop: espacio.s, textAlign: 'center' }}>{texto}</Texto>
    </View>
  );
}

export function Fila({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[e.fila, style]}>{children}</View>;
}

const e = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    padding: espacio.l,
    ...sombra,
  },
  boton: {
    minHeight: 52,
    borderRadius: radio.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacio.xl,
  },
  botonSombra: {
    shadowColor: colores.naranja,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  filaCentro: { flexDirection: 'row', alignItems: 'center' },
  insignia: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radio.pill, alignSelf: 'flex-start' },
  campo: {
    backgroundColor: '#F6EBC0',
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.s,
    paddingHorizontal: espacio.l,
    paddingVertical: 14,
    fontFamily: fuentes.regular,
    fontSize: 16,
    color: colores.texto,
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
