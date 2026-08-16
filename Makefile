SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help dev server web build test lint

help: ## Lista los comandos disponibles
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Levanta backend (cargo) + frontend (vite) con HMR
	@$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cargo run -p probe-server

dev-frontend:
	npm --prefix web run dev

.PHONY: help dev dev-backend dev-frontend server web build test lint

server: ## Solo el backend (API en http://127.0.0.1:7878)
	cargo run -p probe-server

web: ## Solo el frontend dev (vite en :5173, proxya /api)
	npm --prefix web run dev

build: ## Compila el frontend React a crates/probe-server/static/dist/
	npm --prefix web run build

test: ## Tests de Rust + lint del frontend
	cargo test --workspace
	npm --prefix web run lint

lint: ## Lint del frontend (oxlint)
	npm --prefix web run lint
