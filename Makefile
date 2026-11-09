COMPOSE_FILE_DEV=docker compose -f docker/compose.yaml
COMPOSE_FILE_DEBUG=$(COMPOSE_FILE_DEV) -f docker/compose.debug.yaml
COMPOSE_FILE_APPS=docker compose -f docker/apps.compose.yaml
COMPOSE_OPTIONS_UP=-d --build
COMPOSE_OPTIONS_DOWN=-v

.PHONY: all help build start stop restart refresh-deps swagger
all: help
help:
	@echo "Available targets:"
	@echo "  build <env>        Build environment (env=dev|debug|apps-dev|apps-debug)"
	@echo "  start <env>        Start containers with profiles (env=dev|debug|apps-dev|apps-debug)"
	@echo "  stop <env>         Stop containers (env=dev|debug|apps-dev|apps-debug)"
	@echo "  restart <env>      Restart containers (env=dev|debug|apps-dev|apps-debug)"
	@echo "  refresh-deps       Recreate anonymous volumes with profiles"
	@echo "  swagger            Regenerate Swagger metadata"

env=DEV
profile='*'

build:
	$(COMPOSE_FILE_$(env)) build

start:
	$(COMPOSE_FILE_$(env)) --profile $(profile) up $(COMPOSE_OPTIONS_UP)

stop:
	$(COMPOSE_FILE_$(env)) --profile $(profile) down $(COMPOSE_OPTIONS_DOWN)

restart:
	@$(MAKE) stop env=$(env) profile=$(profile)
	@$(MAKE) start env=$(env) profile=$(profile)

refresh-deps:
	$(COMPOSE_FILE_$(env)) --profile $(profile) up $(COMPOSE_OPTIONS_UP) -V

swagger:
	corepack pnpm --filter @tuposoft/lead-email-finder-api exec ts-node src/generate-metadata.ts
