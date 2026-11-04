/**
 * Alertas y confirmaciones que funcionan igual en el celular y en el navegador
 * (Alert.alert de React Native no hace nada en la versión web).
 */
import { Alert, Platform } from 'react-native';

export function avisar(titulo: string, mensaje?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
    return;
  }
  Alert.alert(titulo, mensaje);
}

export function confirmar(titulo: string, mensaje: string, textoAceptar = 'Aceptar'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${titulo}\n\n${mensaje}`) ?? false);
  }
  return new Promise((resolver) => {
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
      { text: textoAceptar, style: 'destructive', onPress: () => resolver(true) },
    ]);
  });
}
