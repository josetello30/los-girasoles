/**
 * Contexto de sesión: quién inició sesión y su perfil (con estado de pago).
 * Al abrir la app recupera el token guardado y valida que siga vigente.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { alExpirar, api, definirToken } from '@/api/cliente';
import type { Perfil, RespuestaLogin } from '@/api/tipos';
import { borrarToken, guardarToken, leerToken } from './almacen';

interface ValorSesion {
  perfil: Perfil | null;
  cargando: boolean;
  iniciarSesion: (login: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  /** Vuelve a leer el perfil (ej. después de pagar, para actualizar la deuda). */
  refrescarPerfil: () => Promise<void>;
}

const SesionContexto = createContext<ValorSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  const cerrarSesion = useCallback(async () => {
    definirToken(null);
    setPerfil(null);
    await borrarToken();
  }, []);

  // Restaurar la sesión guardada al abrir la app
  useEffect(() => {
    alExpirar(() => { void cerrarSesion(); });
    (async () => {
      try {
        const token = await leerToken();
        if (token) {
          definirToken(token);
          setPerfil(await api.get<Perfil>('/auth/yo'));
        }
      } catch {
        await cerrarSesion(); // token vencido o servidor inaccesible: volver al login
      } finally {
        setCargando(false);
      }
    })();
  }, [cerrarSesion]);

  const iniciarSesion = useCallback(async (login: string, password: string) => {
    const { token, usuario } = await api.post<RespuestaLogin>('/auth/login', { login, password });
    if (usuario.rol !== 'SOCIO') {
      throw new Error('Esta app es para socios. El personal usa el panel administrativo.');
    }
    definirToken(token);
    await guardarToken(token);
    setPerfil(usuario);
  }, []);

  const refrescarPerfil = useCallback(async () => {
    setPerfil(await api.get<Perfil>('/auth/yo'));
  }, []);

  const valor = useMemo(
    () => ({ perfil, cargando, iniciarSesion, cerrarSesion, refrescarPerfil }),
    [perfil, cargando, iniciarSesion, cerrarSesion, refrescarPerfil],
  );
  return <SesionContexto.Provider value={valor}>{children}</SesionContexto.Provider>;
}

export function useSesion(): ValorSesion {
  const ctx = useContext(SesionContexto);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return ctx;
}
