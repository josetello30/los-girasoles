# =============================================================================
# Atajos de desarrollo - Club Residencial Los Girasoles
# Uso: make <objetivo>     (ej. make up, make test-db)
# Si usas Podman en lugar de Docker:  make up COMPOSE="podman compose"
# =============================================================================
-include .env
export

COMPOSE ?= docker compose
API_PUERTO := $(or $(BACKEND_PORT),3000)
API_URL := http://localhost:$(API_PUERTO)/api/v1

.PHONY: ayuda env up down logs logs-api reset migrar psql test-db test-api test-dashboard test estado tarjeta app logs-panel

ayuda:            ## Muestra esta ayuda
	@grep -hE '^[a-z-]+:.*## ' Makefile | awk 'BEGIN{FS=":.*## "}{printf "  \033[32m%-14s\033[0m %s\n", $$1, $$2}'

env:              ## Crea .env o le agrega las variables nuevas de .env.example (sin tocar las tuyas)
	@test -f .env || { cp .env.example .env && echo ".env creado"; }
	@grep -E '^[A-Z_]+=' .env.example | while IFS='=' read -r clave valor; do \
		grep -q "^$$clave=" .env || { echo "$$clave=$$valor" >> .env; echo "  + $$clave agregada a .env"; }; \
	done

up: env           ## Construye y levanta todos los contenedores
	$(COMPOSE) up -d --build
	@echo "Esperando a la API..."
	@for i in $$(seq 1 60); do curl -sf $(API_URL)/health >/dev/null 2>&1 && break; sleep 2; done
	@curl -sf $(API_URL)/health >/dev/null 2>&1 \
		&& echo "Listo -> Panel: http://localhost:$(or $(DASHBOARD_PORT),8501)  |  API: $(API_URL)/health  |  Adminer: http://localhost:$(or $(ADMINER_PORT),8080)" \
		|| { echo "La API no respondió. Revisa: make logs-api"; exit 1; }

down:             ## Detiene los contenedores (conserva los datos)
	$(COMPOSE) down

logs:             ## Muestra los logs de PostgreSQL
	$(COMPOSE) logs -f postgres

logs-api:         ## Muestra los logs del backend (cada solicitud con su duración)
	$(COMPOSE) logs -f backend

logs-panel:       ## Muestra los logs del panel administrativo (Streamlit)
	$(COMPOSE) logs -f dashboard

reset:            ## BORRA la BD y la vuelve a crear con la semilla (útil tras cambiar los .sql)
	$(COMPOSE) down -v
	$(MAKE) up

migrar:           ## Aplica los scripts 07+ de database/init sobre la BD actual (sin borrar datos)
	@for f in $$(ls database/init/0[7-9]_*.sql 2>/dev/null); do \
		echo "-> $$f"; \
		$(COMPOSE) exec -T postgres psql -q -v ON_ERROR_STOP=1 -U $(POSTGRES_USER) -d $(POSTGRES_DB) < $$f || exit 1; \
	done

tarjeta:          ## Simula la garita leyendo una tarjeta sin Wokwi: make tarjeta UID=A1B2C3D4
	@curl -s -X POST $(API_URL)/accesos/validar \
		-H 'X-Device-Key: gir-dev-garita-principal-2026' -H 'Content-Type: application/json' \
		-d '{"uid":"$(or $(UID),A1B2C3D4)"}' -w '\nHTTP %{http_code} en %{time_total}s\n'

psql:             ## Abre una consola SQL dentro del contenedor
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

test-db:          ## Ejecuta las 19 pruebas de integridad de la BD
	$(COMPOSE) exec -T postgres psql -q -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f /pruebas/pruebas_integridad.sql 2>&1 \
		| sed 's/^psql:[^ ]* NOTICE:  //'

test-api:         ## Ejecuta las pruebas automáticas de la API (Jest + Supertest)
	$(COMPOSE) --profile pruebas run --rm --build backend-pruebas npx jest --runInBand --verbose

test-dashboard:   ## Ejecuta las pruebas del modelo de riesgo de morosidad (pytest)
	$(COMPOSE) --profile pruebas run --rm --build dashboard-pruebas

test: test-db test-api test-dashboard  ## Ejecuta todas las pruebas

estado:           ## Muestra los KPIs principales (comprobación rápida)
	$(COMPOSE) exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -x -c "SELECT * FROM v_kpi_resumen"

app:              ## Abre la app móvil con Expo (escanea el QR con Expo Go)
	cd mobile && npm install --no-fund --no-audit && npx expo start
