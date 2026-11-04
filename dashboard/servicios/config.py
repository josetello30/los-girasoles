"""
Configuración del dashboard desde variables de entorno (las define docker-compose).
"""
import os

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5433"))
DB_NAME = os.getenv("DB_NAME", "girasoles")
# Rol de SOLO LECTURA: el dashboard nunca escribe directo en la BD
DB_USER = os.getenv("DB_USER", "girasoles_dashboard")
DB_PASSWORD = os.getenv("DB_PASSWORD", "dashboard_dev_2026")

# Las acciones (publicar noticias, registrar pagos, generar planilla...) van por la API
API_URL = os.getenv("API_URL", "http://localhost:3000/api/v1").rstrip("/")

ZONA = "America/Lima"
