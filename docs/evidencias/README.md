# Evidencias de pruebas

Salidas generadas por `make evidencias` (se sobrescriben en cada ejecución).

| Archivo | Origen |
|---|---|
| `contenedores.txt` | Estado de los contenedores (RNF01). Solo se genera en el servidor con Docker |
| `bd.txt` | 19 pruebas de integridad de PostgreSQL |
| `api.txt` | 70 pruebas de la API (Jest + Supertest) |
| `modelo.txt` | 12 pruebas del modelo de riesgo (pytest) |
| `lector.txt` | 19 pruebas del lector QR con cámara web (pytest) |
| `e2e.txt` | 48 pruebas de punta a punta y de seguridad |
| `carga-garita.md` / `.json` | Prueba de carga de la garita (RNF02) |

Los archivos incluidos en el repositorio se generaron en el entorno de desarrollo el 04/11/2026.
Para el informe final, vuelve a generarlos en el servidor Fedora con `make evidencias`.
