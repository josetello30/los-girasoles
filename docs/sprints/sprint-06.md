# Sprint 6 · Pruebas de punta a punta, evidencias e informe final

**Objetivo del sprint:** demostrar con pruebas reproducibles que la plataforma completa cumple sus
requerimientos, corregir lo que las pruebas encuentren y preparar el informe final y la exposición.

## Historias completadas

| ID | Historia | Criterio de aceptación | Estado |
|---|---|---|---|
| HU-46 | Como equipo queremos probar los flujos que cruzan componentes | 30 pruebas E2E contra el sistema levantado: app → API → BD → garita → panel | ✅ |
| HU-47 | Como club queremos saber que la plataforma resiste ataques comunes | 15 pruebas de seguridad (OWASP API Top 10), todas rechazadas | ✅ |
| HU-48 | Como evaluador quiero evidencia del RNF02 bajo carga | 1 a 50 garitas simultáneas; p95 < 2 s y 0 errores | ✅ |
| HU-49 | Como evaluador quiero ver qué prueba cubre cada requerimiento | Matriz de trazabilidad en `docs/PRUEBAS.md` | ✅ |
| HU-50 | Como equipo queremos regenerar todas las evidencias con un comando | `make evidencias` → `docs/evidencias/` | ✅ |
| HU-51 | Como curso queremos el informe final según la guía | Informe con todos los componentes de la guía | ✅ |

## Resultados

| Suite | Pruebas | Resultado |
|---|---|---|
| Base de datos (`make test-db`) | 19 | ✅ 19/19 |
| API (`make test-api`) | 58 | ✅ 58/58 |
| Modelo de IA (`make test-dashboard`) | 12 | ✅ 12/12 |
| Punta a punta y seguridad (`make test-e2e`) | 45 | ✅ 45/45 |
| Carga de la garita (`make carga`) | 4 niveles × 200 | ✅ p95 de 184 ms con 50 simultáneas |
| **Total** | **134 + carga** | **Todo en verde** |

Detalle, matriz de trazabilidad y tablas de carga: [`docs/PRUEBAS.md`](../PRUEBAS.md).

## Defectos encontrados y corregidos

1. **Seguridad:** la API confiaba en `X-Forwarded-For` sin tener un proxy delante, así que se podía
   esquivar el límite de 10 intentos de login falsificando la cabecera. Ahora `TRUST_PROXY` es
   configurable y vale 0 por defecto. La prueba SEG-05 lo verifica.
2. **Calidad:** un cuerpo de más de 100 KB devolvía 500; ahora devuelve 413 con mensaje en español.
3. **Pruebas frágiles:** dos pruebas de la API dependían del día del mes (deuda fija de S/ 540) y otra
   agotaba el cupo de invitados de una familia tras unas pocas ejecuciones. Ahora son independientes
   de la fecha y del número de ejecuciones (verificado con 3 ejecuciones seguidas).

## Decisiones técnicas

1. **Las pruebas E2E no tienen dependencias** (`node:test` y `fetch` de Node 22): corren en un
   contenedor `node:22-alpine` sin `npm install`, o desde la PC con `npm run e2e`.
2. **Mismos contratos que los clientes reales:** la garita se prueba con el mismo `POST` y la misma
   cabecera `X-Device-Key` que usa el firmware del ESP32, así que la prueba vale para el hardware.
3. **Datos aleatorios donde importa:** cada ejecución elige socios distintos para no chocar con los
   límites de negocio (3 reservas, 8 invitados) y deja limpio lo que puede (cancela la reserva,
   retira la noticia).
4. **La prueba de fuerza bruta corre en su propio contenedor**, para que el bloqueo de 15 minutos
   afecte solo a la IP de ese contenedor y no al panel ni a la app.

## Cómo generar las evidencias para el informe

```bash
git pull
make env          # agrega TRUST_PROXY a tu .env
make up
make evidencias   # deja todo en docs/evidencias/
```
