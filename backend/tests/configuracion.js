/**
 * Variables por defecto para las pruebas (se ejecuta antes de cada archivo).
 * Dentro de Docker ya vienen definidas por docker-compose.
 */
process.env.NODE_ENV = 'test';
process.env.TAREAS_ACTIVAS = 'false';
process.env.PASARELA_DEMORA_MS = '0';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas-automaticas-123';
