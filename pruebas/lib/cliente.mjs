/**
 * Cliente HTTP mínimo para las pruebas de punta a punta.
 * Habla con la API exactamente como lo hacen la app móvil (JWT), el panel
 * (JWT de administrador) y la garita ESP32 (cabecera X-Device-Key).
 * Solo usa fetch nativo de Node 22: no requiere `npm install`.
 */
export const API = (process.env.API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');
export const PANEL = (process.env.PANEL_URL || '').replace(/\/$/, '');
export const CLAVE_GARITA = process.env.DEVICE_KEY || 'gir-dev-garita-principal-2026';
export const CLAVE_SOCIOS = 'Girasoles2026';
export const TIMEOUT_MS = 10_000;

/** Ejecuta una solicitud y devuelve { status, body, ms, headers }. Nunca lanza por códigos HTTP. */
export async function solicitar(metodo, ruta, { token, cuerpo, cabeceras = {} } = {}) {
  const inicio = performance.now();
  const res = await fetch(ruta.startsWith('http') ? ruta : API + ruta, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...cabeceras,
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await res.text();
  let body;
  try { body = texto ? JSON.parse(texto) : null; } catch { body = texto; }
  return { status: res.status, body, ms: performance.now() - inicio, headers: res.headers };
}

/** Cliente autenticado: const c = cliente(token); await c.get('/ruta') */
export function cliente(token) {
  return {
    get: (ruta) => solicitar('GET', ruta, { token }),
    post: (ruta, cuerpo = {}) => solicitar('POST', ruta, { token, cuerpo }),
    patch: (ruta, cuerpo = {}) => solicitar('PATCH', ruta, { token, cuerpo }),
    delete: (ruta) => solicitar('DELETE', ruta, { token }),
  };
}

export async function login(usuario, password = CLAVE_SOCIOS) {
  const r = await solicitar('POST', '/auth/login', { cuerpo: { login: usuario, password } });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${usuario}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

/** La garita ESP32: mismo contrato HTTP que usa el firmware del Sprint 3. */
export function garita(cuerpo, clave = CLAVE_GARITA) {
  return solicitar('POST', '/accesos/validar', { cuerpo, cabeceras: clave ? { 'X-Device-Key': clave } : {} });
}

// ------------------------------------------------------------------ fechas (America/Lima)
export function hoyLima(desplazamientoDias = 0) {
  const f = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(f); // AAAA-MM-DD
}

export const aleatorio = (lista) => lista[Math.floor(Math.random() * lista.length)];
export const dniAleatorio = () => String(70_000_000 + Math.floor(Math.random() * 9_999_999));

/**
 * Titular activo con una condición de pago, que pueda iniciar sesión.
 * Se elige al azar para que ejecutar las pruebas varias veces no choque con
 * los límites (3 reservas vigentes, 8 invitados al mes por familia).
 */
export async function titularAlAzar(admin, estadoPago = 'AL_DIA', intentos = 8) {
  const { body } = await cliente(admin).get(`/socios?tipo=TITULAR&estado_socio=ACTIVO&estado_pago=${estadoPago}&limite=100`);
  const candidatos = [...body.datos].sort(() => Math.random() - 0.5);
  for (const socio of candidatos.slice(0, intentos)) {
    const r = await solicitar('POST', '/auth/login', { cuerpo: { login: socio.numero_socio, password: CLAVE_SOCIOS } });
    if (r.status === 200) return { ...socio, token: r.body.token };
  }
  throw new Error(`No se encontró un titular ${estadoPago} con usuario`);
}

/** Mensaje apto para el LCD 16x2 HD44780: máximo 16 caracteres y solo ASCII. */
export const aptoParaLcd = (mensaje) => typeof mensaje === 'string' && mensaje.length <= 16 && /^[\x20-\x7E]*$/.test(mensaje);
