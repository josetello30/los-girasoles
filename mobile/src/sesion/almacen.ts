/**
 * Almacenamiento seguro del token.
 * En el celular usa SecureStore (Keychain en iOS, Keystore en Android).
 * En el navegador (modo web de pruebas) SecureStore no existe: se usa sessionStorage.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CLAVE = 'girasoles.sesion';
const esWeb = Platform.OS === 'web';

export async function leerToken(): Promise<string | null> {
  if (esWeb) return globalThis.sessionStorage?.getItem(CLAVE) ?? null;
  return SecureStore.getItemAsync(CLAVE);
}

export async function guardarToken(token: string): Promise<void> {
  if (esWeb) {
    globalThis.sessionStorage?.setItem(CLAVE, token);
    return;
  }
  await SecureStore.setItemAsync(CLAVE, token);
}

export async function borrarToken(): Promise<void> {
  if (esWeb) {
    globalThis.sessionStorage?.removeItem(CLAVE);
    return;
  }
  await SecureStore.deleteItemAsync(CLAVE);
}
