-- =============================================================================
-- 01_extensiones.sql
-- Club Residencial Los Girasoles de Huampaní
-- Extensiones de PostgreSQL y configuración regional de la base de datos.
-- Se ejecuta automáticamente la PRIMERA vez que se crea el volumen de Docker.
-- =============================================================================

-- gen_random_uuid(), digest() y crypt() para hashes de contraseñas y API keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Permite combinar igualdad (=) con solapamiento de rangos (&&) en una
-- restricción EXCLUDE. Es lo que impide reservas dobles a nivel de BD.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Toda la operación del club ocurre en hora de Lima (UTC-5, sin horario de verano).
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Lima');
END
$$;
