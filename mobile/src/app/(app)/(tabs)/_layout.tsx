/**
 * Barra inferior del prototipo: Inicio · Servicios · Eventos · Alertas · Perfil.
 */
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { colores, fuentes } from '@/tema';

type NombreIcono = keyof typeof Ionicons.glyphMap;

function icono(activo: NombreIcono, inactivo: NombreIcono) {
  // En el SDK 58 (tipos estrictos de RN) el color llega como ColorValue
  function IconoPestana({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? activo : inactivo} size={24} color={color as string} />;
  }
  return IconoPestana;
}

export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.verde,
        tabBarInactiveTintColor: '#9A9A90',
        tabBarLabelStyle: { fontFamily: fuentes.media, fontSize: 11.5 },
        tabBarStyle: { backgroundColor: colores.blanco, borderTopColor: colores.borde, height: 64, paddingTop: 6 },
        sceneStyle: { backgroundColor: colores.crema },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home', 'home-outline') }} />
      <Tabs.Screen name="servicios" options={{ title: 'Servicios', tabBarIcon: icono('grid', 'grid-outline') }} />
      <Tabs.Screen name="eventos" options={{ title: 'Eventos', tabBarIcon: icono('calendar', 'calendar-outline') }} />
      <Tabs.Screen name="noticias" options={{ title: 'Alertas', tabBarIcon: icono('notifications', 'notifications-outline') }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icono('person', 'person-outline') }} />
    </Tabs>
  );
}
