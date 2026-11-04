/**
 * Tira horizontal de días (Lun 13, Mar 14...) como en la pantalla de reservas del prototipo.
 */
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { colores, espacio, fuentes, radio, sombra } from '@/tema';
import { diaDelMes, diaSemana, fechaIso } from '@/utils/formato';
import { Texto } from './Texto';

export function SelectorFecha({ seleccionada, alCambiar, dias = 14 }: {
  seleccionada: string;
  alCambiar: (fecha: string) => void;
  dias?: number;
}) {
  const fechas = Array.from({ length: dias + 1 }, (_, i) => fechaIso(i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.tira}>
      {fechas.map((f) => {
        const activa = f === seleccionada;
        return (
          <Pressable
            key={f}
            onPress={() => alCambiar(f)}
            accessibilityRole="button"
            accessibilityState={{ selected: activa }}
            style={[e.dia, activa && e.diaActivo]}
          >
            <Texto style={[e.textoDia, activa && { color: colores.blanco }]}>{diaSemana(f)}</Texto>
            <Texto style={[e.numero, activa && { color: colores.blanco }]}>{diaDelMes(f)}</Texto>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const e = StyleSheet.create({
  tira: { gap: espacio.s, paddingVertical: espacio.xs, paddingRight: espacio.l },
  dia: {
    width: 54, height: 66, borderRadius: radio.s, backgroundColor: colores.blanco,
    alignItems: 'center', justifyContent: 'center', ...sombra,
  },
  diaActivo: { backgroundColor: colores.verde },
  textoDia: { fontFamily: fuentes.regular, fontSize: 12, color: colores.textoSuave },
  numero: { fontFamily: fuentes.negrita, fontSize: 20, color: colores.texto },
});
