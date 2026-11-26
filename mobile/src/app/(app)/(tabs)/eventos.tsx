/**
 * Eventos: olimpiadas, festividades y actividades con inscripción en línea.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/cliente';
import type { Evento } from '@/api/tipos';
import { Boton, Cargando, ErrorVista, Tarjeta, Vacio } from '@/componentes/basicos';
import { ImagenRemota } from '@/componentes/ImagenRemota';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, espacio, fuentes, radio } from '@/tema';
import { avisar, confirmar } from '@/utils/dialogos';
import { fechaHora, soles } from '@/utils/formato';

type Icono = keyof typeof MaterialCommunityIcons.glyphMap;
const CATEGORIA: Record<Evento['categoria'], { texto: string; color: string; fondo: string; icono: Icono }> = {
  DEPORTE: { texto: 'Deporte', color: colores.naranja, fondo: '#FFE2D2', icono: 'trophy' },
  FESTIVAL: { texto: 'Festival', color: colores.morado, fondo: colores.moradoSuave, icono: 'party-popper' },
  CULTURAL: { texto: 'Cultural', color: colores.azul, fondo: colores.azulSuave, icono: 'palette' },
  RELIGIOSO: { texto: 'Religioso', color: '#5D4037', fondo: '#EFE4DE', icono: 'church' },
  SOCIAL: { texto: 'Social', color: colores.verde, fondo: colores.verdeSuave, icono: 'glass-cocktail' },
};

const DISCIPLINAS = ['Fútbol', 'Vóley', 'Básquet', 'Tenis', 'Frontón', 'Natación'];

function TarjetaEvento({ evento, alCambiar }: { evento: Evento; alCambiar: () => void }) {
  const [disciplina, setDisciplina] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cat = CATEGORIA[evento.categoria];
  // Las olimpiadas piden elegir disciplina; el resto de eventos no
  const requiereDisciplina = evento.titulo.toLowerCase().includes('olimpiada');
  const sinCupos = evento.cupo !== null && evento.inscritos >= evento.cupo;

  async function inscribirse() {
    if (requiereDisciplina && !disciplina) {
      avisar('Elige una disciplina', 'Selecciona en qué deporte participarás.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/eventos/${evento.id}/inscripcion`, disciplina ? { disciplina } : {});
      avisar('¡Inscripción registrada!', `${evento.titulo}${disciplina ? ` · ${disciplina}` : ''}`);
      alCambiar();
    } catch (e) {
      avisar('No se pudo inscribir', e instanceof Error ? e.message : undefined);
    } finally {
      setEnviando(false);
    }
  }

  async function retirarse() {
    if (!(await confirmar('¿Retirar inscripción?', evento.titulo, 'Retirarme'))) return;
    try {
      await api.delete(`/eventos/${evento.id}/inscripcion`);
      alCambiar();
    } catch (e) {
      avisar('No se pudo retirar', e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <Tarjeta style={{ padding: 0, overflow: 'hidden' }}>
      <ImagenRemota
        ruta={evento.imagen_url}
        estilo={[e.portada, { backgroundColor: cat.fondo }, evento.imagen_url ? e.portadaFoto : null]}
        descripcion={`Imagen de ${evento.titulo}`}
        respaldo={<MaterialCommunityIcons name={cat.icono} size={64} color={cat.color} />}
      />
      <View style={{ padding: espacio.l, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={[e.chip, { backgroundColor: cat.color }]}>
            <Texto style={e.textoChip}>{cat.texto}</Texto>
          </View>
          <Texto variante="pequeno">{fechaHora(evento.inicia_en)}</Texto>
        </View>
        <Texto variante="subtitulo">{evento.titulo}</Texto>
        <Texto variante="pequeno" style={{ fontSize: 13.5, lineHeight: 19 }}>{evento.descripcion}</Texto>
        <Texto variante="pequeno">
          📍 {evento.lugar} · {evento.costo > 0 ? soles(evento.costo) : 'Gratis'}
          {evento.cupo ? ` · ${evento.inscritos}/${evento.cupo} inscritos` : evento.inscripciones_abiertas ? ` · ${evento.inscritos} inscritos` : ''}
        </Texto>

        {evento.estoy_inscrito ? (
          <View style={e.inscrito}>
            <Texto style={{ color: colores.exito, fontFamily: fuentes.seminegrita, flex: 1 }}>✓ Estás inscrito</Texto>
            <Pressable onPress={retirarse}><Texto variante="pequeno" style={{ color: colores.peligro }}>Retirarme</Texto></Pressable>
          </View>
        ) : evento.inscripciones_abiertas && !sinCupos ? (
          <>
            {requiereDisciplina && (
              <View style={e.disciplinas}>
                {DISCIPLINAS.map((d) => (
                  <Pressable key={d} onPress={() => setDisciplina(d)} style={[e.disciplina, disciplina === d && e.disciplinaActiva]}>
                    <Texto style={[e.textoDisciplina, disciplina === d && { color: colores.blanco }]}>{d}</Texto>
                  </Pressable>
                ))}
              </View>
            )}
            <Boton titulo="Inscribirme" onPress={inscribirse} cargando={enviando} style={{ marginTop: espacio.s, minHeight: 44 }} />
          </>
        ) : (
          <Texto variante="pequeno" style={{ marginTop: espacio.s }}>
            {sinCupos ? 'Cupos agotados' : 'Evento abierto a todos los socios, sin inscripción previa'}
          </Texto>
        )}
      </View>
    </Tarjeta>
  );
}

export default function Eventos() {
  const { datos, cargando, error, refrescando, recargar } = useConsulta<Evento[]>('/eventos');
  return (
    <Pantalla titulo="Eventos" conRegreso={false} refrescando={refrescando} alRefrescar={recargar}>
      {cargando && <Cargando />}
      {error && !datos && <ErrorVista mensaje={error} alReintentar={recargar} />}
      {datos?.length === 0 && <Vacio icono="calendar-outline" texto="No hay eventos próximos" />}
      {datos?.map((ev) => <TarjetaEvento key={ev.id} evento={ev} alCambiar={recargar} />)}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  portada: { height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' },
  portadaFoto: { height: 170 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radio.pill },
  textoChip: { color: colores.blanco, fontFamily: fuentes.negrita, fontSize: 11.5 },
  inscrito: {
    flexDirection: 'row', alignItems: 'center', marginTop: espacio.s, padding: espacio.m,
    backgroundColor: colores.verdeSuave, borderRadius: radio.s,
  },
  disciplinas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: espacio.s },
  disciplina: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radio.pill, borderWidth: 1, borderColor: colores.borde },
  disciplinaActiva: { backgroundColor: colores.naranja, borderColor: colores.naranja },
  textoDisciplina: { fontSize: 13, fontFamily: fuentes.media },
});
