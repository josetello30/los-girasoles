/**
 * Hook para leer datos de la API con estados de carga y error.
 * Recarga al volver a la pantalla (ej. tras pagar, la deuda se actualiza sola).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { api, ErrorApi } from '@/api/cliente';

export interface Consulta<T> {
  datos: T | null;
  cargando: boolean;
  refrescando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

export function useConsulta<T>(ruta: string | null): Consulta<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primeraVez = useRef(true);

  const cargar = useCallback(async (esRefresco: boolean) => {
    if (!ruta) return;
    if (esRefresco) setRefrescando(true);
    try {
      setDatos(await api.get<T>(ruta));
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi || e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [ruta]);

  // Al enfocar la pantalla: primera carga con indicador; las siguientes, silenciosas
  useFocusEffect(
    useCallback(() => {
      void cargar(false);
      primeraVez.current = false;
    }, [cargar]),
  );

  const recargar = useCallback(() => cargar(true), [cargar]);
  return { datos, cargando, refrescando, error, recargar };
}
