/**
 * Inicio de sesión con número de socio (prototipo: "Panel de login").
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { URL_API } from '@/api/configuracion';
import { Boton, Campo } from '@/componentes/basicos';
import { Logo } from '@/componentes/Logo';
import { Texto } from '@/componentes/Texto';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio, radio, sombra } from '@/tema';
import { avisar } from '@/utils/dialogos';

export default function Login() {
  const { iniciarSesion } = useSesion();
  const insets = useSafeAreaInsets();
  const [numero, setNumero] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verClave, setVerClave] = useState(false);

  async function ingresar() {
    if (!/^\d{5}$/.test(numero.trim())) {
      setError('El número de socio tiene 5 dígitos (ej. 00247)');
      return;
    }
    if (!password) {
      setError('Ingresa tu contraseña');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(numero.trim(), password);
      // Stack.Protected redirige solo a la app al existir sesión
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colores.crema }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[e.cabecera, { paddingTop: insets.top + 48 }]}>
          <View style={e.circulo1} />
          <View style={e.circulo2} />
          <Logo tamano={84} />
          <Texto variante="titulo" style={e.marca}>Los Girasoles</Texto>
          <Texto style={e.lema}>Club Residencial · Huampaní, Perú</Texto>
        </View>

        <View style={e.tarjeta}>
          <Texto variante="subtitulo" style={{ fontSize: 22 }}>Bienvenido</Texto>
          <Texto variante="pequeno" style={{ marginBottom: espacio.xl, fontSize: 14 }}>Ingresa con tu número de socio</Texto>

          <Campo
            etiqueta="Número de Socio"
            placeholder="Ej: 00247"
            keyboardType="number-pad"
            maxLength={5}
            value={numero}
            onChangeText={setNumero}
            autoComplete="username"
          />
          <Campo
            etiqueta="Contraseña"
            placeholder="••••••••"
            secureTextEntry={!verClave}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={ingresar}
            autoComplete="password"
          />
          <Pressable onPress={() => setVerClave((v) => !v)} style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: espacio.m }}>
            <Texto variante="pequeno">{verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}</Texto>
          </Pressable>

          {error && <Texto style={e.error}>{error}</Texto>}

          <Boton titulo="Ingresar" onPress={ingresar} cargando={enviando} />

          <Pressable
            onPress={() => avisar('¿Olvidaste tu contraseña?', 'Acércate a administración con tu DNI o llama al 01 456 0100 para restablecerla.')}
            style={{ alignSelf: 'center', marginTop: espacio.l }}
          >
            <Texto style={{ color: colores.verde, fontFamily: 'Outfit_600SemiBold' }}>¿Olvidaste tu contraseña?</Texto>
          </Pressable>
        </View>

        <Texto variante="pequeno" style={e.pie}>v1.0.0 · Club Residencial Los Girasoles © 2026</Texto>
        {__DEV__ && <Texto variante="pequeno" style={[e.pie, { marginTop: 2 }]}>API: {URL_API}</Texto>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const e = StyleSheet.create({
  cabecera: {
    backgroundColor: colores.verde, alignItems: 'center', paddingBottom: 90, overflow: 'hidden',
  },
  circulo1: {
    position: 'absolute', right: -60, top: 20, width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  circulo2: {
    position: 'absolute', left: -50, bottom: -60, width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  marca: { color: colores.blanco, fontSize: 30, marginTop: espacio.l },
  lema: { color: 'rgba(255,255,255,0.85)', marginTop: 4, fontSize: 14 },
  tarjeta: {
    backgroundColor: colores.blanco, borderRadius: radio.l, marginHorizontal: espacio.l, marginTop: -56,
    padding: espacio.xl, ...sombra,
  },
  error: { color: colores.peligro, marginBottom: espacio.m, textAlign: 'center' },
  pie: { textAlign: 'center', marginTop: espacio.xl, marginBottom: espacio.xl },
});
