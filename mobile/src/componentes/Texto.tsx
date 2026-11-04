/**
 * Texto con la tipografía Outfit del prototipo y variantes predefinidas.
 */
import { StyleSheet, Text, TextProps } from 'react-native';

import { colores, fuentes } from '@/tema';

type Variante = 'titulo' | 'subtitulo' | 'cuerpo' | 'etiqueta' | 'pequeno' | 'numero';

const estilos = StyleSheet.create({
  titulo: { fontFamily: fuentes.negrita, fontSize: 24, color: colores.texto },
  subtitulo: { fontFamily: fuentes.negrita, fontSize: 18, color: colores.texto },
  cuerpo: { fontFamily: fuentes.regular, fontSize: 15, color: colores.texto, lineHeight: 21 },
  etiqueta: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.texto },
  pequeno: { fontFamily: fuentes.regular, fontSize: 12.5, color: colores.textoSuave },
  numero: { fontFamily: fuentes.negrita, fontSize: 34, color: colores.texto },
});

export function Texto({ variante = 'cuerpo', style, ...resto }: TextProps & { variante?: Variante }) {
  return <Text {...resto} style={[estilos[variante], style]} />;
}
