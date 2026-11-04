/**
 * Tipos de las respuestas de la API (ver docs/API.md).
 */
export type EstadoPago = 'AL_DIA' | 'PENDIENTE' | 'VENCIDO';

export interface Perfil {
  id: string;
  login: string;
  rol: 'SOCIO' | 'ADMIN' | 'GUARDIA';
  socio_id: string | null;
  numero_socio: string | null;
  tipo_socio: 'TITULAR' | 'DEPENDIENTE' | null;
  nombres: string | null;
  apellidos: string | null;
  lote: string | null;
  email: string | null;
  telefono: string | null;
  estado_socio: string | null;
  estado_pago: EstadoPago | null;
  deuda_total: number | null;
  deuda_vencida: number | null;
  nombre_mostrar: string | null;
}

export interface RespuestaLogin {
  token: string;
  usuario: Perfil;
}

export interface QrAcceso {
  qr: string;
  vigencia_segundos: number;
  emitido_en: string;
  expira_en: string;
}

export type TipoInstalacion =
  | 'FUTBOL' | 'BASQUET' | 'VOLEY' | 'FRONTON' | 'TENIS' | 'PISCINA' | 'CABANA' | 'CAPILLA' | 'POSTA';

export interface Instalacion {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoInstalacion;
  descripcion: string | null;
  capacidad: number;
  exclusiva: boolean;
  tarifa_hora: number;
  hora_apertura: string;
  hora_cierre: string;
  duracion_bloque_min: number;
  horarios_disponibles: number;
  estado: 'LIBRE' | 'LLENO' | 'MANTENIMIENTO';
}

export interface Franja {
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
  motivo: 'PASADO' | 'MANTENIMIENTO' | 'OCUPADO' | null;
  cupos_libres?: number;
}

export interface Disponibilidad {
  instalacion: Pick<Instalacion, 'id' | 'codigo' | 'nombre' | 'tipo' | 'tarifa_hora' | 'duracion_bloque_min'>;
  fecha: string;
  franjas: Franja[];
}

export interface ReservaCreada {
  id: string;
  estado: 'PENDIENTE' | 'CONFIRMADA';
  monto: number;
  instalacion: string;
  cuota: { id: string; monto: number } | null;
  mensaje: string;
}

export interface MiReserva {
  id: string;
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'COMPLETADA';
  monto: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  instalacion: string;
  tipo: TipoInstalacion;
  cuota_id: string | null;
  saldo_pendiente: number | null;
}

export interface CuotaPendiente {
  cuota_id: string;
  concepto: 'MANTENIMIENTO' | 'RESERVA' | 'EVENTO' | 'TIENDA' | 'OTRO';
  periodo: string;
  descripcion: string;
  monto: number;
  pagado: number;
  saldo: number;
  fecha_vencimiento: string;
  estado: 'PAGADA' | 'PENDIENTE' | 'VENCIDA';
  dias_mora: number;
}

export interface EstadoCuenta {
  resumen: {
    numero_socio: string;
    estado_pago: EstadoPago;
    deuda_total: number;
    deuda_vencida: number;
    cuotas_vencidas: number;
    dias_mora_max: number;
  };
  cuota_mensual: number;
  por_pagar: CuotaPendiente[];
  historial_mantenimiento: {
    cuota_id: string;
    periodo: string;
    monto: number;
    saldo: number;
    fecha_vencimiento: string;
    estado: 'PAGADA' | 'PENDIENTE' | 'VENCIDA';
    ultimo_pago: string | null;
  }[];
}

export interface Comprobante {
  comprobante: {
    id: string;
    monto: number;
    metodo: string;
    referencia: string;
    pagado_en: string;
    concepto: string;
    detalle: string;
  };
  mensaje: string;
}

export interface Noticia {
  id: string;
  titulo: string;
  contenido: string;
  categoria: 'IMPORTANTE' | 'MANTENIMIENTO' | 'EVENTO' | 'GENERAL';
  publicada_en: string;
}

export interface Evento {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: 'DEPORTE' | 'FESTIVAL' | 'CULTURAL' | 'RELIGIOSO' | 'SOCIAL';
  lugar: string;
  inicia_en: string;
  termina_en: string;
  cupo: number | null;
  costo: number;
  inscripciones_abiertas: boolean;
  inscritos: number;
  estoy_inscrito: boolean;
}

export interface ServicioClub {
  id: string;
  nombre: string;
  tipo: 'POSTA' | 'CAPILLA' | 'RESTAURANTE' | 'ADMINISTRACION' | 'OTRO';
  descripcion: string;
  horario: string;
  telefono: string | null;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  precio: number;
  stock: number;
}

export interface PedidoCreado {
  pedido_id: string;
  total: number;
  cuota: { id: string; monto: number };
}

export interface Familiar {
  socio_id: string;
  numero_socio: string;
  tipo: 'TITULAR' | 'DEPENDIENTE';
  parentesco: string | null;
  nombres: string;
  apellidos: string;
  dni: string;
  estado_socio: string;
}

export interface Credencial {
  id: string;
  uid_tarjeta: string;
  estado: 'ACTIVA' | 'REVOCADA' | 'PERDIDA';
  emitida_en: string;
}

export interface InvitadoCreado {
  id: string;
  nombres: string;
  apellidos: string;
  fecha_visita: string;
  qr: string;
  expira_en: string;
  invitados_restantes_mes: number;
}

export interface MiInvitado {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  placa_vehiculo: string | null;
  fecha_visita: string;
  ingreso: boolean;
}
