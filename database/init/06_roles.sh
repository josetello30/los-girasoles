#!/usr/bin/env bash
# =============================================================================
# 06_roles.sh
# Crea los roles de aplicación con el principio de MÍNIMO PRIVILEGIO.
#   app_rw        -> backend Node.js: lee y escribe datos, pero no altera el esquema.
#                    log_acceso y pago son de solo inserción (auditoría inmutable).
#   dashboard_ro  -> Streamlit: solo lectura, sin acceso a hashes de contraseñas,
#                    tokens QR ni API keys de las garitas.
# Es un .sh (no .sql) para leer las contraseñas desde variables de entorno
# en lugar de dejarlas escritas en el repositorio.
# =============================================================================
set -euo pipefail

: "${APP_DB_USER:?Falta APP_DB_USER en el .env}"
: "${APP_DB_PASSWORD:?Falta APP_DB_PASSWORD en el .env}"
: "${DASHBOARD_DB_USER:?Falta DASHBOARD_DB_USER en el .env}"
: "${DASHBOARD_DB_PASSWORD:?Falta DASHBOARD_DB_PASSWORD en el .env}"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" \
     -v dash_user="$DASHBOARD_DB_USER" -v dash_pass="$DASHBOARD_DB_PASSWORD" \
     -v db_name="$POSTGRES_DB" <<'EOSQL'

-- ---------------------------------------------------------------- backend
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pass';
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO :"app_user";

-- Auditoría inmutable: el log de accesos y los pagos no se editan ni se borran.
-- Un pago erróneo solo puede cambiar su columna 'estado' a ANULADO.
REVOKE UPDATE, DELETE ON log_acceso FROM :"app_user";
REVOKE UPDATE, DELETE ON pago       FROM :"app_user";
GRANT  UPDATE (estado) ON pago      TO   :"app_user";

-- ---------------------------------------------------------------- dashboard
CREATE ROLE :"dash_user" LOGIN PASSWORD :'dash_pass';
GRANT CONNECT ON DATABASE :"db_name" TO :"dash_user";
GRANT USAGE ON SCHEMA public TO :"dash_user";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"dash_user";
-- Datos sensibles fuera del alcance del dashboard
REVOKE SELECT ON usuario, token_qr, punto_acceso FROM :"dash_user";
-- Un rol de solo lectura no puede escribir aunque alguien lo intente desde Streamlit
ALTER ROLE :"dash_user" SET default_transaction_read_only = on;
EOSQL

echo "Roles '$APP_DB_USER' (lectura/escritura) y '$DASHBOARD_DB_USER' (solo lectura) creados."
