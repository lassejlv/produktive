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

RUN cargo build --release -p unstatus-api -p unstatus-worker && \
    cp /app/target/release/unstatus-api /tmp/unstatus-api && \
    cp /app/target/release/unstatus-worker /tmp/unstatus-worker

# --- Regional worker runtime ---
FROM debian:bookworm-slim AS worker-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/unstatus-worker /usr/local/bin/unstatus-worker

USER app

CMD ["unstatus-worker"]

# --- API Runtime ---
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/unstatus-api /usr/local/bin/unstatus-api
COPY --from=web-builder /web/dist /app/web/dist

ENV WEB_DIST_DIR=/app/web/dist

USER app

EXPOSE 3000

CMD ["unstatus-api"]
