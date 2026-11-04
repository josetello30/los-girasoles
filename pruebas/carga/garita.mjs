/**
 * Prueba de carga de la validación de acceso (RNF02: respuesta < 2 s).
 *
 * Simula varias garitas leyendo tarjetas al mismo tiempo, con niveles de
 * concurrencia crecientes, y mide el tiempo de respuesta que percibe la garita
 * (ida y vuelta HTTP completa, no solo el tiempo interno del servidor).
 *
 * Uso:   node carga/garita.mjs                 (valores por defecto)
 *        NIVELES=1,10,50 POR_NIVEL=300 node carga/garita.mjs
 *        SALIDA=../docs/evidencias node carga/garita.mjs   (guarda el informe)
 *
 * Nota: cada validación queda en el registro de accesos (como en la realidad).
 * Tras la prueba el panel mostrará esos accesos; `make reset` los limpia.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { API, garita, solicitar } from '../lib/cliente.mjs';

const NIVELES = (process.env.NIVELES || '1,10,25,50').split(',').map(Number);
const POR_NIVEL = Number(process.env.POR_NIVEL || 200);
const META_MS = 2000;

// Mezcla realista: la mayoría son socios activos; algunos casos denegados.
const TARJETAS = [
  ...Array(6).fill('A1B2C3D4'), // socio activo
  ...Array(2).fill('11223344'), // socio moroso (permitido)
  '55667788', // personal de limpieza
  'AABBCCDD', // tarjeta perdida (denegado)
  'C0FFEE99', // no registrada (denegado)
];

const percentil = (ordenados, p) => ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];

async function nivel(concurrencia) {
  const tiempos = [];
  const servidor = [];
  let errores = 0;
  let siguiente = 0;
  const inicio = performance.now();

  // N "garitas" virtuales que toman lecturas de una cola común
  async function garitaVirtual() {
    while (siguiente < POR_NIVEL) {
      const i = siguiente;
      siguiente += 1;
      try {
        const r = await garita({ uid: TARJETAS[i % TARJETAS.length] });
        if (r.status !== 200 && r.status !== 403) errores += 1; // 403 = denegado (respuesta válida)
        tiempos.push(r.ms);
        if (typeof r.body?.latencia_ms === 'number') servidor.push(r.body.latencia_ms);
      } catch {
        errores += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, garitaVirtual));

  const duracion = (performance.now() - inicio) / 1000;
  const t = tiempos.sort((a, b) => a - b);
  const s = servidor.sort((a, b) => a - b);
  return {
    concurrencia,
    solicitudes: t.length,
    errores,
    por_segundo: t.length / duracion,
    p50: percentil(t, 50),
    p95: percentil(t, 95),
    p99: percentil(t, 99),
    max: t[t.length - 1],
    servidor_p95: s.length ? percentil(s, 95) : null,
    cumple_pct: (100 * t.filter((x) => x < META_MS).length) / t.length,
  };
}

const salud = await solicitar('GET', '/health');
if (salud.status !== 200) {
  console.error(`La API no responde en ${API}. Ejecuta primero: make up`);
  process.exit(1);
}

console.log(`Prueba de carga · POST ${API}/accesos/validar · ${POR_NIVEL} lecturas por nivel\n`);
for (let i = 0; i < 20; i += 1) await garita({ uid: 'A1B2C3D4' }); // calentamiento (conexiones, caché)

const resultados = [];
for (const c of NIVELES) {
  const r = await nivel(c);
  resultados.push(r);
  console.log(`  ${String(c).padStart(3)} garitas simultáneas -> p95 ${r.p95.toFixed(0)} ms · ${r.por_segundo.toFixed(0)} lecturas/s · errores ${r.errores}`);
}

const fila = (r) => `| ${r.concurrencia} | ${r.solicitudes} | ${r.por_segundo.toFixed(0)} | ${r.p50.toFixed(0)} | **${r.p95.toFixed(0)}** | ${r.p99.toFixed(0)} | ${r.max.toFixed(0)} | ${r.servidor_p95 ?? '—'} | ${r.cumple_pct.toFixed(1)} % | ${r.errores} |`;
const cumpleTodo = resultados.every((r) => r.p95 < META_MS && r.errores === 0);
const informe = [
  '# Prueba de carga · validación de acceso en garita (RNF02)',
  '',
  `Fecha: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })} · Destino: \`${API}\` · ${POR_NIVEL} lecturas por nivel`,
  '',
  '| Garitas simultáneas | Lecturas | Lecturas/s | p50 (ms) | p95 (ms) | p99 (ms) | Máx. (ms) | p95 servidor (ms) | < 2000 ms | Errores |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...resultados.map(fila),
  '',
  `**Resultado: ${cumpleTodo ? 'CUMPLE' : 'NO CUMPLE'} el RNF02** (p95 < ${META_MS} ms y sin errores en todos los niveles).`,
  '',
  'p95 = el 95 % de las lecturas respondió en ese tiempo o menos, medido desde el cliente (ida y vuelta HTTP).',
  '"p95 servidor" es el tiempo interno que la API reporta en `latencia_ms` (consulta + registro en la BD).',
  'El club tiene una garita principal; 50 lecturas simultáneas es un escenario muy por encima de la operación real.',
  '',
].join('\n');

console.log(`\n${informe}`);
if (process.env.SALIDA) {
  mkdirSync(process.env.SALIDA, { recursive: true });
  writeFileSync(join(process.env.SALIDA, 'carga-garita.md'), informe);
  writeFileSync(join(process.env.SALIDA, 'carga-garita.json'), JSON.stringify({ fecha: new Date().toISOString(), api: API, resultados }, null, 2));
  console.log(`Informe guardado en ${process.env.SALIDA}/carga-garita.md`);
}
process.exit(cumpleTodo ? 0 : 1);
