# syntax=docker/dockerfile:1.7

# --- Web frontend (TanStack Router + Vite via bun) ---
FROM oven/bun:1 AS web-builder

WORKDIR /web

COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

COPY web ./
RUN bun run build

# --- Runtime toolchain for git-source deployment builds ---
FROM debian:bookworm-slim AS deploy-build-tools

ARG TARGETARCH
ARG DEPOT_VERSION=2.101.65
ARG RAILPACK_VERSION=0.30.0
ARG BUILDKIT_VERSION=0.31.1

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl tar gzip && \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
        amd64) depot_arch="amd64"; railpack_target="x86_64-unknown-linux-musl"; buildkit_arch="amd64" ;; \
        arm64) depot_arch="arm64"; railpack_target="arm64-unknown-linux-musl"; buildkit_arch="arm64" ;; \
        *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    tmp="$(mktemp -d)"; \
    curl -fsSL "https://github.com/depot/cli/releases/download/v${DEPOT_VERSION}/depot_${DEPOT_VERSION}_linux_${depot_arch}.tar.gz" -o "$tmp/depot.tar.gz"; \
    tar -xzf "$tmp/depot.tar.gz" -C "$tmp"; \
    install -m 0755 "$tmp/bin/depot" /usr/local/bin/depot; \
    curl -fsSL "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-${railpack_target}.tar.gz" -o "$tmp/railpack.tar.gz"; \
    tar -xzf "$tmp/railpack.tar.gz" -C "$tmp"; \
    install -m 0755 "$tmp/railpack" /usr/local/bin/railpack; \
    curl -fsSL "https://github.com/moby/buildkit/releases/download/v${BUILDKIT_VERSION}/buildkit-v${BUILDKIT_VERSION}.linux-${buildkit_arch}.tar.gz" -o "$tmp/buildkit.tar.gz"; \
    tar -xzf "$tmp/buildkit.tar.gz" -C "$tmp"; \
    install -m 0755 "$tmp/bin/buildctl" /usr/local/bin/buildctl; \
    rm -rf "$tmp"; \
    depot --version; \
    railpack --version; \
    buildctl --version

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
    apt-get install -y --no-install-recommends ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/produktive-deploy-worker /usr/local/bin/produktive-deploy-worker
COPY --from=deploy-build-tools /usr/local/bin/depot /usr/local/bin/railpack /usr/local/bin/buildctl /usr/local/bin/

USER app

CMD ["produktive-deploy-worker"]

# --- API Runtime ---
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin app

COPY --from=builder /tmp/produktive-api /usr/local/bin/produktive-api
COPY --from=builder /tmp/produktive-worker /usr/local/bin/produktive-worker
COPY --from=builder /tmp/produktive-deploy-worker /usr/local/bin/produktive-deploy-worker
COPY --from=deploy-build-tools /usr/local/bin/depot /usr/local/bin/railpack /usr/local/bin/buildctl /usr/local/bin/
COPY --from=web-builder /web/dist /app/web/dist

ENV WEB_DIST_DIR=/app/web/dist

USER app

EXPOSE 3000

CMD ["sh", "-c", "case \"$RAILWAY_SERVICE_NAME\" in \"Deploy Worker\") exec produktive-deploy-worker ;; \"Worker \"*) exec produktive-worker ;; *) exec produktive-api ;; esac"]
