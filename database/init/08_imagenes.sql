-- =============================================================================
-- 08 · Imágenes de servicios del club
-- Eventos, productos, noticias e instalaciones ya tenían imagen_url (02_esquema).
-- Se agrega a servicio_club (restaurante, capilla, posta...).
-- Idempotente: corre en una BD nueva (docker-entrypoint-initdb.d) y sobre una
-- existente con `make migrar`, sin borrar datos.
-- =============================================================================
ALTER TABLE servicio_club ADD COLUMN IF NOT EXISTS imagen_url TEXT;

COMMENT ON COLUMN servicio_club.imagen_url IS
  'Ruta devuelta por POST /archivos (archivos/<uuid>.jpg) o URL https externa';
