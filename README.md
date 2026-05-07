# Produktive

A workspace for issues, projects, team chat, notes, and AI-assisted work. Rust API + React frontend.

## Requirements

- Rust toolchain
- Bun
- Postgres

## Quickstart

```sh
cp .env.example .env
cp web/.env.example web/.env

cd web && bun install && cd ..

cargo run -p produktive-api      # API on :3000
cd web && bun run dev            # web on :5173
```

The API runs migrations on startup. The Vite dev server proxies `/api` to the Rust API.

See [docs/public-api.md](docs/public-api.md) for the public REST API.
