# Pruebas de punta a punta, seguridad y carga

Se ejecutan contra el sistema **levantado** (`make up`), con los mismos contratos HTTP que usan la
app móvil, el panel y el firmware del ESP32. No necesitan `npm install`: solo Node 22.

```bash
make test-e2e    # 30 pruebas de flujos + 15 de seguridad (en su propio contenedor)
make carga       # prueba de carga de la garita (RNF02)
make evidencias  # todas las pruebas del proyecto, con resultados en docs/evidencias/
```

Sin Docker, desde esta carpeta y con la API en `localhost:3000`:

```bash
npm run e2e
npm run carga
PANEL_URL=http://localhost:8501 npm run e2e   # incluye la prueba de salud del panel
```

| Archivo | Contenido |
|---|---|
| `e2e/01_flujos.test.mjs` | E2E-01 a E2E-09: QR, tarjetas Wokwi, moroso, reserva y pago, ventanilla, mantenimiento, noticias, invitados, salud |
| `e2e/02_seguridad.test.mjs` | SEG-01 a SEG-05: autenticación, autorización, inyección, exposición de datos, fuerza bruta |
| `carga/garita.mjs` | 1, 10, 25 y 50 garitas simultáneas; p50, p95, p99 |
| `lib/cliente.mjs` | Cliente HTTP con `fetch` nativo |

> **Ojo:** SEG-05 agota el límite de intentos de login durante 15 minutos **para la IP que ejecuta
> las pruebas**. Con `make test-e2e` es la IP de un contenedor temporal, así que no afecta a la app ni
> al panel. Si las ejecutas con `npm run e2e` desde tu PC, espera 15 minutos o reinicia el backend
> (`docker compose restart backend`) antes de iniciar sesión desde esa misma PC.

Las pruebas crean datos (accesos, pagos, un bloqueo de mantenimiento) como lo haría el uso real;
retiran lo que pueden (la noticia, la reserva). `make reset` deja la base de datos como nueva.

Resultados y matriz de trazabilidad: [`docs/PRUEBAS.md`](../docs/PRUEBAS.md).
