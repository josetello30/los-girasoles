/**
 * Noticia del club (prototipo: tarjeta "Importante · Mantenimiento de Piscina").
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import type { Noticia } from '@/api/tipos';
import { colores, espacio, fuentes, radio } from '@/tema';
import { fechaCorta } from '@/utils/formato';
import { Tarjeta } from './basicos';
import { Texto } from './Texto';

const ESTILO_CATEGORIA: Record<Noticia['categoria'], { texto: string; fondo: string }> = {
  IMPORTANTE: { texto: 'Importante', fondo: colores.naranja },
  MANTENIMIENTO: { texto: 'Mantenimiento', fondo: '#E08A00' },
  EVENTO: { texto: 'Evento', fondo: colores.morado },
  GENERAL: { texto: 'General', fondo: colores.verdeClaro },
};

export function TarjetaNoticia({ noticia, resumida }: { noticia: Noticia; resumida?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const cat = ESTILO_CATEGORIA[noticia.categoria];
  const expandida = !resumida && abierta;

  return (
    <Tarjeta onPress={resumida ? undefined : () => setAbierta((v) => !v)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espacio.s }}>
        <View style={{ backgroundColor: cat.fondo, borderRadius: radio.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Texto style={{ color: colores.blanco, fontFamily: fuentes.negrita, fontSize: 11.5 }}>{cat.texto}</Texto>
        </View>
        <Texto variante="pequeno" style={{ marginLeft: espacio.s, flex: 1 }}>{fechaCorta(noticia.publicada_en)}</Texto>
        {!resumida && <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={18} color={colores.textoSuave} />}
      </View>
      <Texto variante="etiqueta" style={{ fontSize: 16, marginBottom: 4 }}>{noticia.titulo}</Texto>
      <Texto variante="pequeno" style={{ fontSize: 13.5, lineHeight: 19 }} numberOfLines={expandida ? undefined : 2}>
        {noticia.contenido}
      </Texto>
    </Tarjeta>
  );
}
