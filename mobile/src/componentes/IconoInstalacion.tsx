/**
 * Ícono y colores por tipo de instalación (prototipo: lista de reservas).
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import type { TipoInstalacion } from '@/api/tipos';
import { colores } from '@/tema';

type Icono = keyof typeof MaterialCommunityIcons.glyphMap;

export const ESTILO_INSTALACION: Record<TipoInstalacion, { icono: Icono; color: string; fondo: string }> = {
  FUTBOL: { icono: 'soccer', color: colores.verde, fondo: colores.verdeSuave },
  BASQUET: { icono: 'basketball', color: colores.naranja, fondo: colores.naranjaSuave },
  VOLEY: { icono: 'volleyball', color: colores.morado, fondo: colores.moradoSuave },
  FRONTON: { icono: 'racquetball', color: '#E08A00', fondo: '#FFF0D6' },
  TENIS: { icono: 'tennis', color: colores.exito, fondo: '#EAF5E1' },
  PISCINA: { icono: 'pool', color: '#0097A7', fondo: '#DDF3F5' },
  CABANA: { icono: 'grill', color: '#795548', fondo: '#F0E7E3' },
  CAPILLA: { icono: 'church', color: colores.azul, fondo: colores.azulSuave },
  POSTA: { icono: 'medical-bag', color: colores.peligro, fondo: colores.peligroSuave },
};

export function IconoInstalacion({ tipo, tamano = 26, caja = 64 }: { tipo: TipoInstalacion; tamano?: number; caja?: number }) {
  const est = ESTILO_INSTALACION[tipo];
  return (
    <View style={{ width: caja, alignSelf: 'stretch', minHeight: caja, backgroundColor: est.fondo, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={est.icono} size={tamano} color={est.color} />
    </View>
  );
}
