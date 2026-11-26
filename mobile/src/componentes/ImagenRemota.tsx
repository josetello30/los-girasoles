/**
 * Imagen que viene del servidor (eventos, productos, servicios). Si no tiene
 * imagen o no se puede descargar (sin red, archivo borrado), muestra el
 * contenido de respaldo: el ícono que la app usaba antes.
 */
import { type ReactNode, useState } from 'react';
import { Image, type ImageStyle, type StyleProp, View, type ViewStyle } from 'react-native';

import { urlImagen } from '@/api/configuracion';

interface Props {
  ruta: string | null | undefined;
  /** Tamaño y bordes; se aplica igual a la imagen y al respaldo */
  estilo: StyleProp<ViewStyle>;
  respaldo: ReactNode;
  descripcion: string;
}

export function ImagenRemota({ ruta, estilo, respaldo, descripcion }: Props) {
  const [fallo, setFallo] = useState(false);
  const url = urlImagen(ruta);

  if (!url || fallo) return <View style={estilo}>{respaldo}</View>;
  return (
    <Image
      source={{ uri: url }}
      style={estilo as StyleProp<ImageStyle>}
      resizeMode="cover"
      accessibilityLabel={descripcion}
      onError={() => setFallo(true)}
    />
  );
}
