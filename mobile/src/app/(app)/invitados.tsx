/**
 * Invitados: el socio registra a su visita y le comparte un QR válido solo ese día.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api } from '@/api/cliente';
import type { InvitadoCreado, MiInvitado } from '@/api/tipos';
import { Boton, Campo, Fila, Insignia, Tarjeta, Vacio } from '@/componentes/basicos';
import { Pantalla } from '@/componentes/Pantalla';
import { SelectorFecha } from '@/componentes/SelectorFecha';
import { Texto } from '@/componentes/Texto';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContexto';
import { colores, espacio } from '@/tema';
import { avisar } from '@/utils/dialogos';
import { fechaConDia, fechaIso } from '@/utils/formato';

export default function Invitados() {
  const { perfil } = useSesion();
  const lista = useConsulta<MiInvitado[]>('/invitados/mios');
  const [form, setForm] = useState({ dni: '', nombres: '', apellidos: '', placa: '' });
  const [fecha, setFecha] = useState(fechaIso());
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState<InvitadoCreado | null>(null);

  async function registrar() {
    if (!/^\d{8}$/.test(form.dni)) return avisar('DNI inválido', 'El DNI debe tener 8 dígitos.');
    if (form.nombres.trim().length < 2 || form.apellidos.trim().length < 2) return avisar('Completa nombres y apellidos');
    setEnviando(true);
    try {
      const r = await api.post<InvitadoCreado>('/invitados', {
        dni: form.dni, nombres: form.nombres.trim(), apellidos: form.apellidos.trim(),
        fecha_visita: fecha, ...(form.placa.trim() ? { placa_vehiculo: form.placa.trim() } : {}),
      });
      setCreado(r);
      setForm({ dni: '', nombres: '', apellidos: '', placa: '' });
      void lista.recargar();
    } catch (e) {
      avisar('No se pudo registrar', e instanceof Error ? e.message : undefined);
    } finally {
      setEnviando(false);
    }
  }

  async function compartir(inv: InvitadoCreado) {
    await Share.share({
      message:
        `Hola ${inv.nombres}, te espero en el Club Residencial Los Girasoles de Huampaní el ${fechaConDia(inv.fecha_visita)}.\n` +
        `Invita: ${perfil?.nombres} ${perfil?.apellidos} (lote ${perfil?.lote}).\n` +
        `Muestra este código en la garita: ${inv.qr}`,
    });
  }

  return (
    <Pantalla titulo="Mis Invitados" refrescando={lista.refrescando} alRefrescar={lista.recargar}>
      {creado ? (
        <Tarjeta style={{ alignItems: 'center', gap: espacio.s }}>
          <Ionicons name="checkmark-circle" size={36} color={colores.exito} />
          <Texto variante="subtitulo">{creado.nombres} {creado.apellidos}</Texto>
          <Texto variante="pequeno">Válido solo el {fechaConDia(creado.fecha_visita)}</Texto>
          <View style={{ padding: espacio.s, backgroundColor: colores.blanco }}>
            <QRCode value={creado.qr} size={190} />
          </View>
          <Texto variante="pequeno">Te quedan {creado.invitados_restantes_mes} invitaciones este mes</Texto>
          <Boton titulo="Compartir invitación" icono="share-social" onPress={() => compartir(creado)} style={{ alignSelf: 'stretch' }} />
          <Boton titulo="Registrar otro invitado" variante="texto" onPress={() => setCreado(null)} />
        </Tarjeta>
      ) : (
        <Tarjeta>
          <Texto variante="subtitulo" style={{ marginBottom: espacio.m }}>Registrar visita</Texto>
          <Texto variante="etiqueta" style={{ marginBottom: 6 }}>Fecha de la visita</Texto>
          <View style={{ marginBottom: espacio.l }}><SelectorFecha seleccionada={fecha} alCambiar={setFecha} dias={30} /></View>
          <Campo etiqueta="DNI" keyboardType="number-pad" maxLength={8} placeholder="12345678"
            value={form.dni} onChangeText={(t) => setForm({ ...form, dni: t.replace(/\D/g, '') })} />
          <Campo etiqueta="Nombres" placeholder="Nombres del invitado" value={form.nombres} onChangeText={(t) => setForm({ ...form, nombres: t })} />
          <Campo etiqueta="Apellidos" placeholder="Apellidos" value={form.apellidos} onChangeText={(t) => setForm({ ...form, apellidos: t })} />
          <Campo etiqueta="Placa del vehículo (opcional)" placeholder="ABC-123" autoCapitalize="characters" maxLength={7}
            value={form.placa} onChangeText={(t) => setForm({ ...form, placa: t })} />
          <Boton titulo="Registrar y generar QR" icono="qr-code" onPress={registrar} cargando={enviando} />
        </Tarjeta>
      )}

      <Texto variante="subtitulo" style={{ fontSize: 17 }}>Registrados</Texto>
      {lista.datos?.length === 0 && <Vacio icono="people-outline" texto="Aún no registraste invitados" />}
      {lista.datos?.map((i) => (
        <Tarjeta key={i.id}>
          <Fila>
            <View style={{ flex: 1 }}>
              <Texto variante="etiqueta">{i.nombres} {i.apellidos}</Texto>
              <Texto variante="pequeno">DNI {i.dni} · {fechaConDia(i.fecha_visita)}{i.placa_vehiculo ? ` · ${i.placa_vehiculo}` : ''}</Texto>
            </View>
            {i.ingreso ? <Insignia estado="COMPLETADA" texto="Ingresó" /> : i.fecha_visita >= fechaIso() ? <Insignia estado="PENDIENTE" texto="Esperado" /> : <Insignia estado="CANCELADA" texto="No asistió" />}
          </Fila>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
