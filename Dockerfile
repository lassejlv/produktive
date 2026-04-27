FROM oven/bun:1.3.13 AS web-builder

WORKDIR /app/web

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

COPY web ./
RUN bun run build

FROM rust:1.95.0-slim-bookworm AS api-builder

WORKDIR /app

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
RUN cargo build --release -p produktive-api

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=api-builder /app/target/release/produktive-api ./bin/produktive-api
COPY --from=web-builder /app/web/dist ./web/dist

ENV WEB_DIST_DIR=/app/web/dist

EXPOSE 3000

CMD ["./bin/produktive-api"]
