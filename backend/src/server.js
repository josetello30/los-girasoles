/**
 * Punto de entrada: abre el puerto HTTP, inicia las tareas programadas
 * y cierra todo ordenadamente cuando Docker detiene el contenedor.
 */
'use strict';

const config = require('./config/env');
const db = require('./db');
const { crearApp } = require('./app');
const { iniciarTareas, detenerTareas } = require('./tareas/programadas');

async function esperarBaseDeDatos(intentos = 15) {
  for (let i = 1; i <= intentos; i += 1) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      console.warn(`[inicio] BD no disponible (intento ${i}/${intentos}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('No se pudo conectar a PostgreSQL');
}

async function iniciar() {
  await esperarBaseDeDatos();
  const servidor = crearApp().listen(config.puerto, '0.0.0.0', () => {
    console.log(`[inicio] API Los Girasoles escuchando en el puerto ${config.puerto} (${config.entorno})`);
  });
  iniciarTareas();

  // Apagado ordenado: deja de aceptar conexiones, termina las en curso y cierra el pool.
  const apagar = (senal) => {
    console.log(`[apagado] ${senal} recibido, cerrando...`);
    detenerTareas();
    servidor.close(async () => {
      await db.cerrar();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

iniciar().catch((err) => {
  console.error('[inicio] Error fatal:', err);
  process.exit(1);
});
