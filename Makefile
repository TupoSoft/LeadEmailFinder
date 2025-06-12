# Variables
COMPOSE_DEV=docker compose -f docker/compose.yaml
COMPOSE_DEBUG=docker compose -f docker/compose.yaml -f docker/compose.debug.yaml
COMPOSE_APPS=docker compose -f docker/apps.compose.yaml

# Default Behavior
.PHONY: all help check clean build start stop build-dev start-dev stop-dev restart-dev build-debug start-debug stop-debug refresh-deps start-apps stop-apps

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
	@echo "  start-apps			Start all the apps separately"

# Environment-Specific Commands
build-dev:
	$(COMPOSE_DEV) build

build-debug:
	$(COMPOSE_DEBUG) build

start-dev:
	$(COMPOSE_DEV) up -d --build

start-debug:
	$(COMPOSE_DEBUG) up -d --build

start-apps:
	$(COMPOSE_APPS) up -d --build

stop-apps:
	$(COMPOSE_APPS) down -v

stop-dev:
	$(COMPOSE_DEV) down -v

stop-debug:
	$(COMPOSE_DEBUG) down -v

restart-dev: stop-dev build-dev start-dev

restart-debug: stop-debug build-debug start-debug

refresh-deps:
	$(COMPOSE_DEV) up -d --build -V
