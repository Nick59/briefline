COMPOSE := docker compose
SERVICE := briefline

.DEFAULT_GOAL := help
.PHONY: help env build up down restart logs ps shell rebuild clean install dev test check lint format

help: ## List the targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example when it is missing
	@test -f .env || (cp .env.example .env && echo "Created .env")

build: ## Build the Docker image
	$(COMPOSE) build

up: env ## Start the app behind Traefik
	@mkdir -p data
	$(COMPOSE) up -d --build
	@echo "Briefline: http://$$(grep -E '^BRIEFLINE_DOMAIN=' .env | cut -d= -f2- | grep . || echo briefline.localhost)"

down: ## Stop the app
	$(COMPOSE) down

restart: ## Restart the app container
	$(COMPOSE) restart $(SERVICE)

rebuild: ## Rebuild the image without cache and restart
	@mkdir -p data
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

logs: ## Follow the app logs
	$(COMPOSE) logs -f $(SERVICE)

ps: ## Show container status
	$(COMPOSE) ps

shell: ## Open a shell in the running container
	$(COMPOSE) exec $(SERVICE) sh

clean: ## Stop the app and remove its containers; data/ is kept
	$(COMPOSE) down --remove-orphans

install: ## Install dependencies locally
	pnpm install

dev: ## Run the local dev server
	pnpm dev

test: ## Run the tests
	pnpm test

check: ## Type check
	pnpm check

lint: ## Run Prettier and ESLint
	pnpm lint

format: ## Format the code
	pnpm format
