set dotenv-load := true

default:
    @just --list

# --- backend ---

api:
    cargo run -p unstatus-api

migrate *args="up":
    cargo run -p unstatus-migration -- {{args}}

check:
    cargo check --workspace

fmt:
    cargo fmt --all

clippy:
    cargo clippy --workspace --all-targets -- -D warnings

icmp-caps:
    sudo setcap cap_net_raw+ep target/debug/unstatus-api

worker:
    cargo run -p unstatus-worker

worker-build:
    cargo build --release -p unstatus-worker

# --- frontend ---

web-install:
    cd web && bun install

web-dev:
    cd web && bun run dev

web-build:
    cd web && bun run build

web-typecheck:
    cd web && bun run typecheck

web-gen-api:
    cd web && bun run gen:api

# --- Caddy custom-domain proxy ---

caddy-config:
    cd deploy/caddy && docker compose config

# --- combined ---

# Run api (:3000) and web (:5173) together. Ctrl-C kills both.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT INT TERM
    cargo run -p unstatus-api &
    (cd web && bun run dev) &
    wait
