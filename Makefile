# Variables
COMPOSE_DEV=docker compose -f docker/compose.yaml
COMPOSE_DEBUG=docker compose -f docker/compose.yaml -f docker/compose.debug.yaml
COMPOSE_APPS=docker compose -f docker/apps.compose.yaml

# Default Behavior
.PHONY: all help check clean build start stop build-dev start-dev stop-dev restart-dev build-debug start-debug stop-debug refresh-deps start-apps-dev stop-apps-dev start-apps-debug stop-apps-debug

all: help

help:
	@echo "Available targets:"
	@echo "  build-dev  		Build development environment"
	@echo "  start-dev  		Start development containers"
	@echo "  stop-dev   		Stop development containers"
	@echo "  refresh-deps		Start recreating anonymous volumes"
	@echo "  restart-dev 		Restart development containers"
	@echo "  build-debug		Build debug environment"
	@echo "  start-debug		Start debug containers"
	@echo "  stop-debug			Stop debug containers"
	@echo "  start-apps-dev		Start all the apps separately"
	@echo "  stop-apps-dev		Stop all the apps"

build-dev:
	$(COMPOSE_DEV) build

build-debug:
	$(COMPOSE_DEBUG) build

start-dev:
	$(COMPOSE_DEV) up -d --build

start-debug:
	$(COMPOSE_DEBUG) up -d --build

start-apps-dev:
	$(COMPOSE_APPS) --profile dev up -d --build

start-apps-debug:
	$(COMPOSE_APPS) --profile debug up -d --build

stop-apps-debug:
	$(COMPOSE_APPS) --profile debug down -v

stop-apps-dev:
	$(COMPOSE_APPS) --profile dev down -v

stop-dev:
	$(COMPOSE_DEV) down -v

stop-debug:
	$(COMPOSE_DEBUG) down -v

restart-dev: stop-dev build-dev start-dev

restart-debug: stop-debug build-debug start-debug

refresh-deps:
	$(COMPOSE_DEV) up -d --build -V
