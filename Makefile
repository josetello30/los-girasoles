# =============================================================================
# Atajos de desarrollo - Club Residencial Los Girasoles
# Uso: make <objetivo>     (ej. make up, make test-db)
# Si usas Podman en lugar de Docker:  make up COMPOSE="podman compose"
# =============================================================================
-include .env
export

COMPOSE ?= docker compose

.PHONY: ayuda env up down logs reset psql test-db estado

ayuda:            ## Muestra esta ayuda
	@grep -hE '^[a-z-]+:.*## ' Makefile | awk 'BEGIN{FS=":.*## "}{printf "  \033[32m%-10s\033[0m %s\n", $$1, $$2}'

env:              ## Crea el archivo .env a partir de .env.example (si no existe)
	@test -f .env && echo ".env ya existe" || (cp .env.example .env && echo ".env creado")

up: env           ## Levanta los contenedores en segundo plano
	$(COMPOSE) up -d
	@echo "Esperando a PostgreSQL..."
	@until $(COMPOSE) exec -T postgres pg_isready -h 127.0.0.1 -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; do sleep 2; done
	@echo "Listo. Adminer: http://localhost:$(ADMINER_PORT)"

down:             ## Detiene los contenedores (conserva los datos)
	$(COMPOSE) down

logs:             ## Muestra los logs de PostgreSQL
	$(COMPOSE) logs -f postgres

reset:            ## BORRA la BD y la vuelve a crear con la semilla (útil tras cambiar los .sql)
	$(COMPOSE) down -v
	$(MAKE) up

psql:             ## Abre una consola SQL dentro del contenedor
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

test-db:          ## Ejecuta las pruebas de integridad de la BD
	$(COMPOSE) exec -T postgres psql -q -U $(POSTGRES_USER) -d $(POSTGRES_DB) -f /pruebas/pruebas_integridad.sql 2>&1 \
		| sed 's/^psql:[^ ]* NOTICE:  //'

estado:           ## Muestra los KPIs principales (comprobación rápida)
	$(COMPOSE) exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -x -c "SELECT * FROM v_kpi_resumen"
