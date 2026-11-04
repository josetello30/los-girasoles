/**
 * Layout raíz: carga la tipografía, provee la sesión y decide qué rutas
 * están disponibles (Stack.Protected): sin sesión solo existe /login.
 */
import {
  Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts,
} from '@expo-google-fonts/outfit';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Cargando } from '@/componentes/basicos';
import { ProveedorSesion, useSesion } from '@/sesion/SesionContexto';
import { colores } from '@/tema';

function Navegacion() {
  const { perfil, cargando } = useSesion();

  if (cargando) {
    return <View style={{ flex: 1, backgroundColor: colores.crema }}><Cargando texto="Iniciando..." /></View>;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.crema } }}>
      <Stack.Protected guard={!!perfil}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!perfil}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function LayoutRaiz() {
  const [fuentesListas] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  if (!fuentesListas) return null; // la pantalla de bienvenida nativa sigue visible

  return (
    <SafeAreaProvider>
      <ProveedorSesion>
        <StatusBar style="light" />
        <Navegacion />
      </ProveedorSesion>
    </SafeAreaProvider>
  );
}
