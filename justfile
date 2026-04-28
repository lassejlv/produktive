set dotenv-load := true

default:
    @just --list

# Run the Rust API and Vite web app together
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'pids=$(jobs -pr); if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; fi' EXIT INT TERM
    cargo run -p produktive-api &
    (cd web && bun run dev) &
    wait

# Run the Rust API only
api:
    cargo run -p produktive-api

# Run the Vite web app only
web:
    cd web && bun run dev

# Run database migrations
migrate:
    cargo run -p produktive-migration -- up

# Check Rust and web code
check:
    cargo fmt --check
    cargo check
    cd web && bun run check

# Build the API and web app
build:
    cargo build --release -p produktive-api
    cd web && bun run build
