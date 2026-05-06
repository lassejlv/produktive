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

## Self-host with Docker

Run the setup script on a fresh Ubuntu/Debian VM:

```sh
curl -fsSL https://raw.githubusercontent.com/lassejlv/produktive/main/docker/setup.sh | bash
```

To install somewhere other than `/opt/produktive`:

```sh
curl -fsSL https://raw.githubusercontent.com/lassejlv/produktive/main/docker/setup.sh | bash -s -- --dir /opt/produktive
```

The script installs Docker and the Docker Compose plugin, clones this repository, prompts for the app, MCP, and Discord bot env files, and starts the stack with Caddy. Postgres is not included in the default Compose file; the setup script offers an optional local Postgres service and enables it only when you choose it.
