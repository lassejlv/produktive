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
ARG JWT_SECRET
ARG CORS_ORIGINS
ARG AUTH_COOKIE_NAME
ARG AUTH_COOKIE_DOMAIN
ARG AUTH_COOKIE_SECURE
ARG AUTH_SESSION_DAYS
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/produktive-api /usr/local/bin/produktive-api

EXPOSE 3000
CMD ["produktive-api"]
