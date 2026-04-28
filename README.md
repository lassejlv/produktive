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

Chat file attachments use S3-compatible object storage. Configure
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and
`S3_SECRET_ACCESS_KEY`. Uploaded objects default to `https://cdn.produktive.app`;
set `S3_PUBLIC_URL` to override the public bucket/domain.

## Web Development

```sh
cd web
bun install
bun run dev
```

The web app expects `VITE_API_URL` to point at the API. See `web/.env.example`.

## Dev Commands

```sh
just dev
```

`just dev` loads `.env` and runs the Rust API plus the Bun/Vite web app
together. Use `just --list` to see the rest of the local workflow commands.

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

Railway should use Railpack for this repo. `railpack.json` builds
`produktive-api`, installs Bun for the nested Vite app, builds `web/dist`, and
copies the API binary into `bin/produktive-api` before starting it. The Rust
version is pinned in `rust-toolchain.toml` so Railway uses the same toolchain as
local development.
