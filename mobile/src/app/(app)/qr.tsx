/**
 * Código de acceso: QR dinámico de un solo uso que se renueva cada 5 minutos (RF01).
 */
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api } from '@/api/cliente';
import type { QrAcceso } from '@/api/tipos';
import { Boton, Insignia, Tarjeta } from '@/componentes/basicos';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio, fuentes, radio } from '@/tema';

export default function CodigoAcceso() {
  const { perfil } = useSesion();
  const [qr, setQr] = useState<QrAcceso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restante, setRestante] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const venceEn = useRef(0);       // marca local de vencimiento (evita depender del reloj del servidor)
  const generando = useRef(false);

  const generar = useCallback(async () => {
    if (generando.current) return;
    generando.current = true;
    try {
      const nuevo = await api.post<QrAcceso>('/accesos/qr');
      venceEn.current = Date.now() + nuevo.vigencia_segundos * 1000;
      setQr(nuevo);
      setRestante(nuevo.vigencia_segundos);
      setError(null);
      setCopiado(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el código');
    } finally {
      generando.current = false;
    }
  }, []);

  // Genera un código nuevo cada vez que se abre la pantalla
  useFocusEffect(useCallback(() => { void generar(); }, [generar]));

  // Cuenta regresiva; al llegar a cero se renueva solo
  useEffect(() => {
    const t = setInterval(() => {
      if (!venceEn.current) return;
      const s = Math.max(0, Math.round((venceEn.current - Date.now()) / 1000));
      setRestante(s);
      if (s === 0) void generar();
    }, 1000);
    return () => clearInterval(t);
  }, [generar]);

  async function copiar() {
    if (!qr) return;
    await Clipboard.setStringAsync(qr.qr);
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiado(true);
  }

  const total = qr?.vigencia_segundos ?? 300;
  const minutos = String(Math.floor(restante / 60)).padStart(2, '0');
  const segundos = String(restante % 60).padStart(2, '0');

  return (
    <Pantalla titulo="Código de Acceso">
      <Tarjeta style={e.socio}>
        <View style={e.escudo}>
          <Ionicons name="shield-checkmark" size={26} color={colores.exito} />
        </View>
        <View style={{ flex: 1 }}>
          <Texto variante="pequeno">{perfil?.nombres} {perfil?.apellidos}</Texto>
          <Texto variante="subtitulo">Socio #{perfil?.numero_socio}</Texto>
          <View style={{ marginTop: 4 }}><Insignia estado="ACTIVO" texto="✓ ACTIVO" /></View>
        </View>
      </Tarjeta>

      <Tarjeta style={{ alignItems: 'center', paddingVertical: espacio.xl }}>
        {qr ? (
          <View style={e.marcoQr}>
            <QRCode value={qr.qr} size={220} color={colores.oscuro} backgroundColor={colores.blanco} ecl="M" />
          </View>
        ) : error ? (
          <View style={{ height: 236, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="cloud-offline-outline" size={40} color={colores.textoSuave} />
            <Texto style={{ textAlign: 'center', marginTop: espacio.s }}>{error}</Texto>
          </View>
        ) : (
          <View style={{ height: 236, justifyContent: 'center' }}><ActivityIndicator color={colores.verde} size="large" /></View>
        )}

        <Texto variante="pequeno" style={{ marginTop: espacio.l }}>Código dinámico · Válido por</Texto>
        <View style={e.barra}>
          <View style={[e.progreso, { width: `${(restante / total) * 100}%` }]} />
        </View>
        <Texto style={e.reloj}>{minutos}:{segundos}</Texto>

        <View style={{ flexDirection: 'row', gap: espacio.m, marginTop: espacio.m }}>
          <Pressable onPress={generar} style={e.accion} accessibilityRole="button">
            <Ionicons name="refresh" size={16} color={colores.verde} />
            <Texto style={e.textoAccion}>Generar nuevo</Texto>
          </Pressable>
          <Pressable onPress={copiar} style={e.accion} accessibilityRole="button" disabled={!qr}>
            <Ionicons name={copiado ? 'checkmark' : 'copy-outline'} size={16} color={colores.verde} />
            <Texto style={e.textoAccion}>{copiado ? 'Copiado' : 'Copiar código'}</Texto>
          </Pressable>
        </View>
      </Tarjeta>

      <View style={e.info}>
        <Texto style={{ fontSize: 14, lineHeight: 20 }}>
          ⚡ Este código se actualiza automáticamente cada 5 minutos y sirve para un solo ingreso.
          Muéstralo al personal de seguridad en el ingreso del club.
        </Texto>
      </View>

      {error && qr && <Boton titulo="Reintentar" variante="secundario" onPress={generar} />}
    </Pantalla>
  );
}

const e = StyleSheet.create({
  socio: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  escudo: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colores.verdeSuave,
    alignItems: 'center', justifyContent: 'center',
  },
  marcoQr: { padding: espacio.s, backgroundColor: colores.blanco },
  barra: { width: '72%', height: 6, borderRadius: 3, backgroundColor: colores.verdeSuave, marginTop: espacio.s, overflow: 'hidden' },
  progreso: { height: 6, backgroundColor: colores.exito, borderRadius: 3 },
  reloj: { fontFamily: fuentes.negrita, fontSize: 34, color: colores.verde, marginTop: espacio.s },
  accion: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: espacio.m,
    borderRadius: radio.pill, backgroundColor: colores.verdeSuave,
  },
  textoAccion: { color: colores.verde, fontFamily: fuentes.seminegrita, fontSize: 13 },
  info: {
    backgroundColor: colores.amarilloSuave, borderColor: colores.amarillo, borderWidth: 1,
    borderRadius: radio.m, padding: espacio.l,
  },
});
