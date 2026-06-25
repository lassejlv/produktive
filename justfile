set dotenv-load := true

default:
    @just --list

# --- backend ---

api:
    cargo run -p produktive-api

migrate *args="up":
    cargo run --manifest-path crates/migration/Cargo.toml -- {{args}}

check:
    cargo check --workspace

fmt:
    cargo fmt --all

clippy:
    cargo clippy --workspace --all-targets -- -D warnings

icmp-caps:
    sudo setcap cap_net_raw+ep target/debug/produktive-api

worker:
    cargo run -p produktive-worker

worker-build:
    cargo build --release -p produktive-worker

deploy-worker:
    cargo run -p produktive-deploy-worker

deploy-worker-build:
    cargo build --release -p produktive-deploy-worker

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

# --- combined ---

# Run api (:3000) and web (:5173) together. Ctrl-C kills both.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT INT TERM
    cargo run -p produktive-api &
    (cd web && bun run dev) &
    wait
