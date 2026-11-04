# Prueba de carga · validación de acceso en garita (RNF02)

Fecha: 4/11/2026, 8:44:17 a. m. · Destino: `http://localhost:3000/api/v1` · 200 lecturas por nivel

| Garitas simultáneas | Lecturas | Lecturas/s | p50 (ms) | p95 (ms) | p99 (ms) | Máx. (ms) | p95 servidor (ms) | < 2000 ms | Errores |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 200 | 198 | 4 | **8** | 11 | 16 | 3 | 100.0 % | 0 |
| 10 | 200 | 382 | 23 | **48** | 87 | 101 | 15 | 100.0 % | 0 |
| 25 | 200 | 495 | 47 | **77** | 124 | 141 | 29 | 100.0 % | 0 |
| 50 | 200 | 546 | 76 | **184** | 197 | 217 | 42 | 100.0 % | 0 |

**Resultado: CUMPLE el RNF02** (p95 < 2000 ms y sin errores en todos los niveles).

p95 = el 95 % de las lecturas respondió en ese tiempo o menos, medido desde el cliente (ida y vuelta HTTP).
"p95 servidor" es el tiempo interno que la API reporta en `latencia_ms` (consulta + registro en la BD).
El club tiene una garita principal; 50 lecturas simultáneas es un escenario muy por encima de la operación real.
