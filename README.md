# Produktive

Produktive is a workspace for issues, projects, team chat, AI-assisted work,
and workspace integrations. The app is built as a Rust backend with a Bun/Vite
React frontend.

## Stack

- Rust API: Axum, SeaORM, Postgres, Resend, S3-compatible storage
- Web app: Bun, Vite, React, TanStack Router, TanStack Query, Tailwind CSS v4
- MCP: a standalone Produktive MCP server plus in-app remote MCP server support
- Deployment: Dockerfile-based images for the app and MCP server

## Repository Layout

```txt
crates/api        HTTP API, auth, AI chat, GitHub import, storage
crates/entity     SeaORM entities
crates/migration  SeaORM migrations
crates/mcp        Standalone MCP server for Produktive workspaces
crates/ai         AI client helpers
crates/unkey      Unkey API client
web               Vite React app
```

## Features

- Email/password auth with verification, password reset, session cookies, and
  workspace switching
- Workspace issues, labels, projects, members, comments, notifications, inbox,
  favorites, and tab state
- Public REST API v1 for workspace issues, labels, and projects using unified
  workspace API keys
- Team chat with streaming AI responses, file attachments, and workspace-aware
  tool calls
- Workspace settings for members, AI/MCP configuration, GitHub import,
  and dangerous workspace actions
- GitHub issue import with saved repositories, labels, previews, manual import,
  and scheduled auto-import locks
- S3-compatible attachment storage
- Standalone MCP server with workspace, member, label, project, issue, and
  comment tools

See [docs/public-api.md](docs/public-api.md) for public API authentication,
endpoints, and examples.

## Requirements

- Rust toolchain
- Bun
- Postgres

## Environment

Copy the examples and fill in local values:

```sh
cp .env.example .env
cp web/.env.example web/.env
```

The API reads `.env` values such as:

- `DATABASE_URL` and `DATABASE_DIRECT_URL`
- `JWT_SECRET`
- `APP_URL`
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_FROM`
- `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`
- `UNKEY_ROOT_KEY` and `UNKEY_API_ID` for workspace API/MCP key creation and verification
- `MCP_TOKEN_ENCRYPTION_KEY`
- `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_SIGNING_SECRET`
- S3-compatible storage settings

The web app uses the Vite `/api` proxy by default. Set
`VITE_API_PROXY_TARGET` in `web/.env` only when the API is not running at
`http://localhost:3000`.

## Local Development

Install web dependencies:

```sh
cd web
bun install
```

Run the API from the repository root:

```sh
cargo run -p produktive-api
```

The API runs migrations on startup and listens on `PORT`, defaulting to `3000`.

Run the web app in another shell:

```sh
cd web
bun run dev
```

The Vite app listens on `http://localhost:5173` and proxies `/api` requests to
the Rust API.

## Useful Commands

From the repository root:

```sh
cargo check
cargo build -p produktive-api
cargo run -p produktive-api
cargo run -p produktive-api --bin migrate_unkey_keys
cargo run -p produktive-migration -- up
cargo run -p produktive-mcp
```

From `web/`:

```sh
bun run dev
bun run build
bun run check
bun run lint
bun run format:check
```

## Routing Notes

The frontend uses TanStack Router file routes. Pathless app routes live under
`web/src/routes/_app.*`, and generated types are written to
`web/src/routeTree.gen.ts`. Parent layout routes that have nested children must
render an `Outlet`; for example, `/workspace/settings` is a child of
`/_app/workspace` and renders through the workspace route outlet.

## Deployment Notes

The root `Dockerfile` builds the web app with Bun, builds `produktive-api` with
Rust, copies both artifacts into a slim Debian runtime image, and serves the
built frontend from `WEB_DIST_DIR=/app/web/dist`.

Build the main app image:

```sh
docker build -t produktive .
```

Run it with production environment values:

```sh
docker run --env-file .env -p 3000:3000 produktive
```

The standalone MCP server has its own Dockerfile:

```sh
docker build -f Dockerfile.mcp -t produktive-mcp .
docker run --env-file .env -p 3001:3001 produktive-mcp
```

The Discord bot also has its own Dockerfile:

```sh
docker build -f Dockerfile.bot -t produktive-discord-bot .
docker run --env-file .env produktive-discord-bot
```

The bot exposes `GET /status` on `PORT` (default `3000`) for health checks.
