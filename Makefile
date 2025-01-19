# Variables
COMPOSE_DEV=docker compose -f docker/compose.yaml
COMPOSE_DEBUG=docker compose -f docker/compose.yaml -f docker/compose.debug.yaml

# Default Behavior
.PHONY: all help check clean build start stop build-dev start-dev stop-dev restart-dev build-debug start-debug stop-debug

all: help

help:
	@echo "Available targets:"
	@echo "  build-dev  		Build development environment"
	@echo "  start-dev  		Start development containers"
	@echo "  stop-dev   		Stop development containers"
	@echo "  restart-dev 		Restart development containers"
	@echo "  build-debug        Build debug environment"
	@echo "  start-debug        Start debug containers"
	@echo "  stop-debug         Stop debug containers"
	@echo "  clean              Clean up unused Docker resources"

# Environment-Specific Commands
build-dev:
	$(COMPOSE_DEV) build

start-dev:
	$(COMPOSE_DEV) up -d

stop-dev:
	$(COMPOSE_DEV) down -v

restart-dev: stop-dev build-dev start-dev

build-debug:
	$(COMPOSE_DEBUG) build

start-debug:
	$(COMPOSE_DEBUG) up -d

stop-debug:
	$(COMPOSE_DEBUG) down -v

restart-debug: stop-debug build-debug start-debug

# Generic Commands
clean:
	docker system prune -f
	docker volume prune -f
