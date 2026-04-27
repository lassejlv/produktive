# Produktive

Rust API and Bun/Vite web app for Produktive.

## API Setup

```sh
cp .env.example .env
cargo run -p produktive-migration -- up
cargo run -p produktive-api
```

The API listens on `http://localhost:3000` by default. It uses Axum, Tokio,
SeaORM, and DB-backed JWT cookies for auth.

## Web Development

```sh
cd web
bun install
bun run dev
```

The web app expects `VITE_API_URL` to point at the API. See `web/.env.example`.

## Checks

```sh
cargo fmt --check
cargo check
cargo test
cd web && bun run check && bun run build
```

## Docker

```sh
docker build -t produktive-api .
docker run --rm -p 3000:3000 --env-file .env produktive-api
```
