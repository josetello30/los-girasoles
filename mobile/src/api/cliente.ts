/**
 * Cliente HTTP de la API: agrega el token, aplica un tiempo límite y convierte
 * los errores del backend ({ error: { codigo, mensaje } }) en ErrorApi.
 */
import { TIEMPO_ESPERA_MS, URL_API } from './configuracion';

export class ErrorApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

let tokenActual: string | null = null;
let alExpirarSesion: (() => void) | null = null;

export function definirToken(token: string | null) {
  tokenActual = token;
}

/** La sesión registra aquí qué hacer si el backend responde 401 (sesión vencida). */
export function alExpirar(fn: () => void) {
  alExpirarSesion = fn;
}

async function solicitud<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_ESPERA_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(tokenActual ? { Authorization: `Bearer ${tokenActual}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: controlador.signal,
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', `No se pudo conectar con el servidor (${URL_API}). Revisa que estés en la misma red WiFi que la PC.`);
  } finally {
    clearTimeout(temporizador);
  }

  if (respuesta.status === 204) return undefined as T;

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    if (respuesta.status === 401 && tokenActual && alExpirarSesion) alExpirarSesion();
    throw new ErrorApi(
      respuesta.status,
      datos?.error?.codigo ?? 'ERROR',
      datos?.error?.mensaje ?? `Error ${respuesta.status}`,
    );
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => solicitud<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => solicitud<T>('POST', ruta, cuerpo ?? {}),
  patch: <T>(ruta: string, cuerpo?: unknown) => solicitud<T>('PATCH', ruta, cuerpo ?? {}),
  delete: <T>(ruta: string) => solicitud<T>('DELETE', ruta),
};
