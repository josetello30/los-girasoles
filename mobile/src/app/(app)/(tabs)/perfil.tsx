/**
 * Perfil: datos del socio, familia, tarjetas RFID (con reporte de pérdida) y cierre de sesión.
 */
import { Ionicons } from '@expo/vector-icons';
import { Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api/cliente';
import type { Credencial, Familiar } from '@/api/tipos';
import { Boton, Fila, Insignia, Tarjeta } from '@/componentes/basicos';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio, fuentes, radio } from '@/tema';
import { avisar, confirmar } from '@/utils/dialogos';
import { fechaCorta } from '@/utils/formato';

const PARENTESCO: Record<string, string> = {
  CONYUGE: 'Cónyuge', HIJO: 'Hijo(a)', PADRE: 'Padre', MADRE: 'Madre', OTRO: 'Familiar',
};

function Dato({ etiqueta, valor, completo }: { etiqueta: string; valor?: string | null; completo?: boolean }) {
  return (
    <View style={completo ? { width: '100%' } : { flex: 1, minWidth: '45%' }}>
      <Texto variante="pequeno">{etiqueta}</Texto>
      <Texto variante="etiqueta">{valor || '—'}</Texto>
    </View>
  );
}

function Enlace({ icono, texto, ruta }: { icono: keyof typeof Ionicons.glyphMap; texto: string; ruta: Href }) {
  return (
    <Pressable onPress={() => router.push(ruta)} style={({ pressed }) => [e.enlace, pressed && { opacity: 0.7 }]}>
      <View style={e.iconoEnlace}><Ionicons name={icono} size={20} color={colores.verde} /></View>
      <Texto variante="etiqueta" style={{ flex: 1 }}>{texto}</Texto>
      <Ionicons name="chevron-forward" size={18} color={colores.textoSuave} />
    </Pressable>
  );
}

export default function Perfil() {
  const { perfil, cerrarSesion } = useSesion();
  const insets = useSafeAreaInsets();
  const familia = useConsulta<Familiar[]>('/socios/yo/familia');
  const tarjetas = useConsulta<Credencial[]>('/socios/yo/credenciales');

  const iniciales = `${perfil?.nombres?.[0] ?? ''}${perfil?.apellidos?.[0] ?? ''}`.toUpperCase();

  async function reportarPerdida(t: Credencial) {
    const ok = await confirmar(
      '¿Reportar tarjeta perdida?',
      `La tarjeta ••${t.uid_tarjeta.slice(-4)} quedará bloqueada de inmediato en todas las garitas. Mientras tanto puedes ingresar con tu QR.`,
      'Bloquear tarjeta',
    );
    if (!ok) return;
    try {
      await api.post(`/socios/yo/credenciales/${t.id}/reportar-perdida`);
      avisar('Tarjeta bloqueada', 'Acércate a administración para solicitar una nueva.');
      await tarjetas.recargar();
    } catch (err) {
      avisar('No se pudo bloquear', err instanceof Error ? err.message : undefined);
    }
  }

  async function salir() {
    if (await confirmar('Cerrar sesión', '¿Quieres salir de tu cuenta?', 'Cerrar sesión')) await cerrarSesion();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colores.crema }} contentContainerStyle={{ paddingBottom: espacio.xxl }}>
      <View style={[e.encabezado, { paddingTop: insets.top + espacio.xl }]}>
        <View style={e.avatar}><Texto style={e.iniciales}>{iniciales}</Texto></View>
        <Texto variante="subtitulo" style={{ color: colores.blanco, marginTop: espacio.m, fontSize: 21 }}>
          {perfil?.nombres} {perfil?.apellidos}
        </Texto>
        <Texto style={{ color: colores.amarillo, fontFamily: fuentes.seminegrita }}>#{perfil?.numero_socio}</Texto>
        <View style={e.chip}>
          <Texto style={{ color: colores.blanco, fontFamily: fuentes.seminegrita, fontSize: 12 }}>
            {perfil?.tipo_socio === 'TITULAR' ? 'Socio Titular' : 'Socio Dependiente'}
          </Texto>
        </View>
      </View>

      <View style={{ padding: espacio.l, gap: espacio.l, marginTop: -espacio.xl }}>
        <Tarjeta style={{ gap: espacio.m }}>
          <Texto variante="subtitulo" style={{ fontSize: 17 }}>Mis Datos</Texto>
          <View style={e.datos}>
            <Dato etiqueta="Lote" valor={perfil?.lote} />
            <Dato etiqueta="Estado" valor={perfil?.estado_socio === 'ACTIVO' ? 'Activo' : perfil?.estado_socio} />
            <Dato etiqueta="Teléfono" valor={perfil?.telefono} />
            <Dato etiqueta="Tipo" valor={perfil?.tipo_socio === 'TITULAR' ? 'Titular' : 'Dependiente'} />
            <Dato etiqueta="Correo" valor={perfil?.email} completo />
          </View>
        </Tarjeta>

        <Tarjeta style={{ gap: espacio.s }}>
          <Texto variante="subtitulo" style={{ fontSize: 17 }}>Mi Familia</Texto>
          {familia.datos?.map((f) => (
            <Fila key={f.socio_id} style={e.familiar}>
              <View style={{ flex: 1 }}>
                <Texto variante="etiqueta">{f.nombres} {f.apellidos}</Texto>
                <Texto variante="pequeno">
                  {f.tipo === 'TITULAR' ? 'Titular' : PARENTESCO[f.parentesco ?? 'OTRO']} · #{f.numero_socio}
                </Texto>
              </View>
              <Insignia estado={f.estado_socio} />
            </Fila>
          ))}
        </Tarjeta>

        <Tarjeta style={{ gap: espacio.s }}>
          <Texto variante="subtitulo" style={{ fontSize: 17 }}>Mis Tarjetas de Acceso</Texto>
          {tarjetas.datos?.map((t) => (
            <Fila key={t.id} style={e.familiar}>
              <Ionicons name="card-outline" size={22} color={colores.verde} style={{ marginRight: espacio.m }} />
              <View style={{ flex: 1 }}>
                <Texto variante="etiqueta">RFID ••{t.uid_tarjeta.slice(-4)}</Texto>
                <Texto variante="pequeno">Emitida el {fechaCorta(t.emitida_en)}</Texto>
              </View>
              {t.estado === 'ACTIVA' ? (
                <Pressable onPress={() => reportarPerdida(t)} style={e.reportar}>
                  <Texto style={{ color: colores.peligro, fontSize: 12, fontFamily: fuentes.seminegrita }}>Reportar pérdida</Texto>
                </Pressable>
              ) : (
                <Insignia estado={t.estado} />
              )}
            </Fila>
          ))}
        </Tarjeta>

        <Tarjeta style={{ paddingVertical: espacio.s }}>
          <Enlace icono="calendar-outline" texto="Mis reservas" ruta="/reservas/mias" />
          <Enlace icono="card-outline" texto="Pagos y estado de cuenta" ruta="/pagos" />
          <Enlace icono="people-outline" texto="Mis invitados" ruta="/invitados" />
          <Enlace icono="bag-handle-outline" texto="Tienda del club" ruta="/tienda" />
        </Tarjeta>

        <Boton titulo="Cerrar sesión" variante="peligro" icono="log-out-outline" onPress={salir} />
      </View>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  encabezado: {
    backgroundColor: colores.verde, alignItems: 'center', paddingBottom: espacio.xxl + espacio.l,
    borderBottomLeftRadius: radio.l, borderBottomRightRadius: radio.l,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colores.amarillo, borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  iniciales: { fontFamily: fuentes.negrita, fontSize: 32, color: colores.verde },
  chip: { marginTop: espacio.s, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: radio.pill },
  datos: { flexDirection: 'row', flexWrap: 'wrap', rowGap: espacio.m, columnGap: espacio.m },
  familiar: { paddingVertical: espacio.s, borderTopWidth: 1, borderTopColor: '#F2ECD8' },
  reportar: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radio.s, backgroundColor: colores.peligroSuave },
  enlace: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.m, gap: espacio.m },
  iconoEnlace: { width: 36, height: 36, borderRadius: 10, backgroundColor: colores.verdeSuave, alignItems: 'center', justifyContent: 'center' },
});
