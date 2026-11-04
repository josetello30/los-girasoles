/**
 * Rutas internas (solo con sesión): pestañas + pantallas de detalle apiladas.
 */
import { Stack } from 'expo-router';

import { colores } from '@/tema';

export default function LayoutApp() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.crema } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pagos/pagar" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
