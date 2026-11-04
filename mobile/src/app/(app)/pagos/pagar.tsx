/**
 * Pago en línea con la pasarela SIMULADA del backend (tarjeta o Yape/Plin).
 * El número de tarjeta solo viaja al backend; nunca se guarda en el celular.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/cliente';
import type { Comprobante } from '@/api/tipos';
import { Boton, Campo, Fila, Tarjeta } from '@/componentes/basicos';
import { Pantalla } from '@/componentes/Pantalla';
import { Texto } from '@/componentes/Texto';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio, fuentes, radio } from '@/tema';
import { fechaHora, soles } from '@/utils/formato';

type Metodo = 'TARJETA' | 'YAPE_PLIN';

/** Agrupa el número de tarjeta de 4 en 4 mientras se escribe. */
const formatearTarjeta = (t: string) => t.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatearVencimiento = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export default function Pagar() {
  const { cuota, monto, concepto } = useLocalSearchParams<{ cuota: string; monto: string; concepto?: string }>();
  const { refrescarPerfil } = useSesion();
  const [metodo, setMetodo] = useState<Metodo>('TARJETA');
  const [tarjeta, setTarjeta] = useState({ numero: '', vencimiento: '', cvv: '', titular: '' });
  const [billetera, setBilletera] = useState({ celular: '', codigo: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<Comprobante['comprobante'] | null>(null);

  function validar(): string | null {
    if (metodo === 'TARJETA') {
      if (tarjeta.numero.replace(/\s/g, '').length < 15) return 'Número de tarjeta incompleto';
      if (!/^\d{2}\/\d{2}$/.test(tarjeta.vencimiento)) return 'Vencimiento en formato MM/AA';
      if (!/^\d{3,4}$/.test(tarjeta.cvv)) return 'CVV inválido';
      if (tarjeta.titular.trim().length < 3) return 'Ingresa el nombre del titular';
    } else {
      if (!/^9\d{8}$/.test(billetera.celular)) return 'Celular de 9 dígitos que empiece en 9';
      if (!/^\d{6}$/.test(billetera.codigo)) return 'El código de aprobación tiene 6 dígitos';
    }
    return null;
  }

  async function pagar() {
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const cuerpo = metodo === 'TARJETA'
        ? { cuota_id: cuota, metodo, tarjeta: { ...tarjeta, numero: tarjeta.numero.replace(/\s/g, '') } }
        : { cuota_id: cuota, metodo, billetera: { celular: billetera.celular, codigo_aprobacion: billetera.codigo } };
      const r = await api.post<Comprobante>('/pagos', cuerpo);
      setComprobante(r.comprobante);
      void refrescarPerfil().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el pago');
    } finally {
      setEnviando(false);
    }
  }

  // ---------------- Pago aprobado
  if (comprobante) {
    return (
      <Pantalla titulo="Pago exitoso" conRegreso={false}>
        <View style={{ alignItems: 'center', marginVertical: espacio.xl }}>
          <Ionicons name="checkmark-circle" size={88} color={colores.exito} />
          <Texto variante="titulo" style={{ marginTop: espacio.m }}>{soles(comprobante.monto)}</Texto>
          <Texto variante="pequeno">{comprobante.concepto}</Texto>
        </View>
        <Tarjeta style={{ gap: espacio.s }}>
          <Fila><Texto variante="pequeno">Operación</Texto><Texto variante="etiqueta">{comprobante.referencia}</Texto></Fila>
          <Fila><Texto variante="pequeno">Medio</Texto><Texto variante="etiqueta">{comprobante.detalle}</Texto></Fila>
          <Fila><Texto variante="pequeno">Fecha</Texto><Texto variante="etiqueta">{fechaHora(comprobante.pagado_en)}</Texto></Fila>
        </Tarjeta>
        <Boton titulo="Listo" variante="secundario" onPress={() => router.back()} />
      </Pantalla>
    );
  }

  // ---------------- Formulario
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pantalla titulo="Pagar">
        <Tarjeta>
          <Texto variante="pequeno">{concepto ?? 'Pago'}</Texto>
          <Texto variante="numero">{soles(Number(monto))}</Texto>
        </Tarjeta>

        <View style={e.metodos}>
          {(['TARJETA', 'YAPE_PLIN'] as Metodo[]).map((m) => (
            <Pressable key={m} onPress={() => { setMetodo(m); setError(null); }} style={[e.metodo, metodo === m && e.metodoActivo]}>
              <Ionicons name={m === 'TARJETA' ? 'card' : 'phone-portrait'} size={18} color={metodo === m ? colores.blanco : colores.verde} />
              <Texto style={[e.textoMetodo, metodo === m && { color: colores.blanco }]}>{m === 'TARJETA' ? 'Tarjeta' : 'Yape / Plin'}</Texto>
            </Pressable>
          ))}
        </View>

        <Tarjeta>
          {metodo === 'TARJETA' ? (
            <>
              <Campo etiqueta="Número de tarjeta" placeholder="4111 1111 1111 1111" keyboardType="number-pad"
                value={tarjeta.numero} onChangeText={(t) => setTarjeta({ ...tarjeta, numero: formatearTarjeta(t) })} />
              <View style={{ flexDirection: 'row', gap: espacio.m }}>
                <View style={{ flex: 1 }}>
                  <Campo etiqueta="Vencimiento" placeholder="MM/AA" keyboardType="number-pad"
                    value={tarjeta.vencimiento} onChangeText={(t) => setTarjeta({ ...tarjeta, vencimiento: formatearVencimiento(t) })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo etiqueta="CVV" placeholder="123" keyboardType="number-pad" secureTextEntry maxLength={4}
                    value={tarjeta.cvv} onChangeText={(t) => setTarjeta({ ...tarjeta, cvv: t.replace(/\D/g, '') })} />
                </View>
              </View>
              <Campo etiqueta="Nombre del titular" placeholder="Como figura en la tarjeta" autoCapitalize="characters"
                value={tarjeta.titular} onChangeText={(t) => setTarjeta({ ...tarjeta, titular: t })} />
              <Pressable onPress={() => setTarjeta({ numero: '4111 1111 1111 1111', vencimiento: '12/30', cvv: '123', titular: 'SOCIO DE PRUEBA' })}>
                <Texto variante="pequeno" style={{ color: colores.verde }}>Usar tarjeta de prueba (pasarela simulada)</Texto>
              </Pressable>
            </>
          ) : (
            <>
              <Campo etiqueta="Celular afiliado" placeholder="987654321" keyboardType="phone-pad" maxLength={9}
                value={billetera.celular} onChangeText={(t) => setBilletera({ ...billetera, celular: t.replace(/\D/g, '') })} />
              <Campo etiqueta="Código de aprobación" placeholder="6 dígitos (en tu app Yape/Plin)" keyboardType="number-pad" maxLength={6}
                value={billetera.codigo} onChangeText={(t) => setBilletera({ ...billetera, codigo: t.replace(/\D/g, '') })} />
            </>
          )}
        </Tarjeta>

        {error && <Texto style={{ color: colores.peligro, textAlign: 'center' }}>{error}</Texto>}
        <Boton titulo={`Pagar ${soles(Number(monto))}`} icono="lock-closed" onPress={pagar} cargando={enviando} />
        <Texto variante="pequeno" style={{ textAlign: 'center' }}>
          🔒 Pasarela de pagos simulada para fines académicos. No se procesan cobros reales.
        </Texto>
      </Pantalla>
    </KeyboardAvoidingView>
  );
}

const e = StyleSheet.create({
  metodos: { flexDirection: 'row', gap: espacio.m },
  metodo: {
    flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: radio.s, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde,
  },
  metodoActivo: { backgroundColor: colores.verde, borderColor: colores.verde },
  textoMetodo: { fontFamily: fuentes.seminegrita, color: colores.verde },
});
