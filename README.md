# Produktive

Rust API and Bun/Vite web app for Produktive.

## API Setup

```sh
cp .env.example .env
cargo run -p produktive-migration -- up
cargo run -p produktive-api
```

The API listens on `http://localhost:3000` by default. It uses Axum, Tokio,
SeaORM, DB-backed JWT cookies, and Resend email for auth. Runtime database
traffic uses `DATABASE_URL`; migrations prefer `DATABASE_DIRECT_URL` and fall
back to `DATABASE_URL`. It also serves the built web app from `WEB_DIST_DIR`,
which defaults to `web/dist`.

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

## Railway / Railpack

```sh
railway up
```

Railway should use Railpack for this repo. `railpack.json` lets the Rust
provider build `produktive-api`, installs Bun for the nested Vite app, builds
`web/dist`, and starts the API with `./bin/produktive-api`. The Rust version is
pinned in `rust-toolchain.toml` so Railway uses the same toolchain as local
development.
