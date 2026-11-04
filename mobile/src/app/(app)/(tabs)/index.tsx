/**
 * Inicio (prototipo: "Menú principal").
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Noticia } from '@/api/tipos';
import { Fila, Tarjeta } from '@/componentes/basicos';
import { GrillaCompacta } from '@/componentes/GrillaServicios';
import { TarjetaNoticia } from '@/componentes/TarjetaNoticia';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio, fuentes, radio, sombra } from '@/tema';
import { saludo, soles } from '@/utils/formato';

export default function Inicio() {
  const { perfil, refrescarPerfil } = useSesion();
  const insets = useSafeAreaInsets();
  const noticias = useConsulta<Noticia[]>('/noticias');

  const nombre = perfil?.nombres?.split(' ').slice(0, 2).join(' ') ?? '';
  const recargar = async () => {
    await Promise.all([noticias.recargar(), refrescarPerfil().catch(() => undefined)]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colores.crema }}
      contentContainerStyle={{ paddingBottom: espacio.xxl }}
      refreshControl={<RefreshControl refreshing={noticias.refrescando} onRefresh={recargar} tintColor={colores.blanco} />}
    >
      {/* ---------------- Encabezado */}
      <View style={[e.encabezado, { paddingTop: insets.top + espacio.l }]}>
        <View style={e.circulo} />
        <Fila>
          <View style={{ flex: 1 }}>
            <Texto style={e.saludo}>{saludo()},</Texto>
            <Texto variante="titulo" style={{ color: colores.blanco, fontSize: 26 }}>{nombre} 👋</Texto>
            <Texto style={e.socio}>
              Socio #{perfil?.numero_socio} · {perfil?.estado_socio === 'ACTIVO' ? 'Activo' : perfil?.estado_socio}
            </Texto>
          </View>
          <Pressable accessibilityLabel="Ver alertas" onPress={() => router.push('/noticias')} style={e.campana}>
            <Ionicons name="notifications" size={22} color={colores.blanco} />
            <View style={e.punto} />
          </Pressable>
        </Fila>
      </View>

      {/* ---------------- Tarjeta del QR dinámico */}
      <View style={e.tarjetaQr}>
        <View style={{ flex: 1 }}>
          <Texto style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Tu Código de Acceso</Texto>
          <Texto variante="subtitulo" style={{ color: colores.blanco, marginBottom: espacio.m }}>QR Dinámico</Texto>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/qr')}
            style={({ pressed }) => [e.botonQr, pressed && { opacity: 0.85 }]}
          >
            <Texto style={{ color: colores.blanco, fontFamily: fuentes.negrita }}>Generar QR →</Texto>
          </Pressable>
        </View>
        <View style={e.miniQr}>
          <QRCode value="GIRASOLES" size={72} color={colores.oscuro} backgroundColor="#EDEDED" />
        </View>
      </View>

      <View style={{ paddingHorizontal: espacio.l, gap: espacio.l }}>
        {/* ---------------- Aviso de deuda (solo si corresponde) */}
        {perfil?.estado_pago && perfil.estado_pago !== 'AL_DIA' && (
          <Tarjeta onPress={() => router.push('/pagos')} style={[e.aviso, perfil.estado_pago === 'VENCIDO' && e.avisoVencido]}>
            <Ionicons name="alert-circle" size={26} color={perfil.estado_pago === 'VENCIDO' ? colores.peligro : colores.alerta} />
            <View style={{ flex: 1, marginLeft: espacio.m }}>
              <Texto variante="etiqueta">
                {perfil.estado_pago === 'VENCIDO' ? 'Tienes cuotas vencidas' : 'Tienes cuotas por regularizar'}
              </Texto>
              <Texto variante="pequeno">
                {soles(perfil.deuda_vencida)} vencidos{perfil.estado_pago === 'VENCIDO' ? ' · las reservas están bloqueadas' : ''}
              </Texto>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colores.textoSuave} />
          </Tarjeta>
        )}

        {/* ---------------- Servicios */}
        <Texto variante="subtitulo">Servicios del Club</Texto>
        <GrillaCompacta />

        {/* ---------------- Novedades */}
        <Fila>
          <Texto variante="subtitulo">Novedades</Texto>
          <Pressable onPress={() => router.push('/noticias')}>
            <Texto style={{ color: colores.naranja, fontFamily: fuentes.seminegrita }}>Ver todo</Texto>
          </Pressable>
        </Fila>
        {(noticias.datos ?? []).slice(0, 3).map((n) => <TarjetaNoticia key={n.id} noticia={n} resumida />)}
        {noticias.error && <Texto variante="pequeno">{noticias.error}</Texto>}
      </View>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  encabezado: {
    backgroundColor: colores.verde, paddingHorizontal: espacio.l, paddingBottom: 92, overflow: 'hidden',
  },
  circulo: {
    position: 'absolute', right: -50, top: 10, width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  saludo: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  socio: { color: colores.amarillo, fontFamily: fuentes.seminegrita, marginTop: 4 },
  campana: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  punto: {
    position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colores.naranja, borderWidth: 1.5, borderColor: colores.verde,
  },
  tarjetaQr: {
    backgroundColor: colores.oscuro, borderRadius: radio.l, marginHorizontal: espacio.l, marginTop: -72,
    marginBottom: espacio.xl, padding: espacio.xl, flexDirection: 'row', alignItems: 'center', ...sombra,
  },
  botonQr: {
    backgroundColor: colores.naranja, borderRadius: radio.s, paddingVertical: 12, paddingHorizontal: espacio.l,
    alignSelf: 'flex-start',
  },
  miniQr: { backgroundColor: '#EDEDED', borderRadius: radio.s, padding: 8 },
  aviso: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: colores.alerta },
  avisoVencido: { borderLeftColor: colores.peligro },
});
