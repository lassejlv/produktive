# syntax=docker/dockerfile:1.7

# --- Web frontend (TanStack Router + Vite via bun) ---
FROM oven/bun:1 AS web-builder

WORKDIR /web

COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

COPY web ./
RUN bun run build

# --- Rust API ---
FROM rust:1-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates

RUN cargo build --release -p produktive-api -p produktive-worker -p produktive-deploy-worker && \
    cp /app/target/release/produktive-api /tmp/produktive-api && \
    cp /app/target/release/produktive-worker /tmp/produktive-worker && \
    cp /app/target/release/produktive-deploy-worker /tmp/produktive-deploy-worker

# --- Regional worker runtime ---
FROM debian:bookworm-slim AS worker-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/produktive-worker /usr/local/bin/produktive-worker

USER app

CMD ["produktive-worker"]

# --- Deployment worker runtime ---
FROM debian:bookworm-slim AS deploy-worker-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/produktive-deploy-worker /usr/local/bin/produktive-deploy-worker

USER app

CMD ["produktive-deploy-worker"]

# --- API Runtime ---
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/produktive-api /usr/local/bin/produktive-api
COPY --from=web-builder /web/dist /app/web/dist

ENV WEB_DIST_DIR=/app/web/dist

USER app

EXPOSE 3000

CMD ["produktive-api"]
