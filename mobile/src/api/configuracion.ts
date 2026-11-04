/**
 * Dirección del backend.
 *
 * Con Expo Go el celular descarga la app desde tu PC (ej. 192.168.1.20:8081),
 * así que la API está en esa misma IP, puerto 3000. Se detecta sola: no hay que
 * escribir la IP a mano cada vez que cambia el WiFi.
 *
 * Para forzar otra dirección: EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/api/v1 npx expo start
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PUERTO_API = 3000;

function detectarUrlApi(): string {
  const forzada = process.env.EXPO_PUBLIC_API_URL;
  if (forzada) return forzada.replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${PUERTO_API}/api/v1`;
  }

  // hostUri = "192.168.1.20:8081" (la PC que ejecuta `expo start`)
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${PUERTO_API}/api/v1`;

  // Emulador Android: 10.0.2.2 es la PC anfitriona
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${PUERTO_API}/api/v1`
    : `http://localhost:${PUERTO_API}/api/v1`;
}

export const URL_API = detectarUrlApi();
export const TIEMPO_ESPERA_MS = 10000;
