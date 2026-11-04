/**
 * Logo del club: cuadro amarillo redondeado con el centro del girasol.
 */
import { View } from 'react-native';

import { colores } from '@/tema';

export function Logo({ tamano = 72 }: { tamano?: number }) {
  const centro = tamano * 0.3;
  return (
    <View
      style={{
        width: tamano, height: tamano, borderRadius: tamano * 0.26, backgroundColor: colores.amarillo,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6,
      }}
    >
      <View style={{ width: centro, height: centro, borderRadius: centro / 2, backgroundColor: '#8C521E', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: centro * 0.55, height: centro * 0.55, borderRadius: centro, backgroundColor: '#5C3414' }} />
      </View>
    </View>
  );
}
