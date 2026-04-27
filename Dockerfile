FROM oven/bun:latest AS web-build
WORKDIR /app/web
ARG VITE_API_URL
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web .
RUN bun run build

FROM rust:1.95.0-bookworm AS build
WORKDIR /app

COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY crates crates
RUN cargo build --release -p produktive-api

FROM debian:bookworm-slim AS production
WORKDIR /app
ARG PORT
ARG DATABASE_URL
ARG DATABASE_DIRECT_URL
ARG JWT_SECRET
ARG CORS_ORIGINS
ARG AUTH_COOKIE_NAME
ARG AUTH_COOKIE_DOMAIN
ARG AUTH_COOKIE_SECURE
ARG AUTH_SESSION_DAYS
ARG WEB_DIST_DIR
ARG APP_URL
ARG RESEND_API_KEY
ARG RESEND_FROM_EMAIL
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/produktive-api /usr/local/bin/produktive-api
COPY --from=web-build /app/web/dist ./web/dist

EXPOSE 3000
CMD ["produktive-api"]
