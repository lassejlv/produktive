# Repository Guidelines

## Project Structure & Module Organization

Produktive is a Rust workspace with a Bun/Vite React frontend:

- `crates/api`: Axum HTTP API, auth, AI chat, billing, integrations.
- `crates/discord-bot`: Discord commands and agent workflows.
- `crates/mcp`: standalone Produktive MCP server.
- `crates/entity`: shared SeaORM entities.
- `crates/migration`: SeaORM migrations. Do not hand-write ad hoc SQL.
- `crates/ai`: AI client and model helpers.
- `web/src`: React routes, components, hooks, queries, and mutations.
- `web/public`, `web/index.html`: browser assets and shell.
- `docs`: product and API docs.

## Build, Test, and Development Commands

- `just dev`: run the Rust API and Vite web app together.
- `just api`: run only `produktive-api`.
- `just web`: run only the Vite dev server.
- `just migrate`: apply database migrations.
- `just check`: run Rust formatting, Rust checks, and frontend typecheck.
- `just build`: build release API and production web.
- `cargo check -p produktive-api`: focused backend check.
- `cargo check -p produktive-discord-bot`: focused Discord bot check.
- `cd web && bun run lint`: run Oxlint.
- `cd web && bun run format:check`: check Oxfmt formatting.

## Coding Style & Naming Conventions

Rust uses edition 2021 and `cargo fmt`. Keep database models in `crates/entity`, HTTP handlers in `crates/api/src/http`, bot behavior in `crates/discord-bot`, and MCP behavior in `crates/mcp`.

Frontend code uses TypeScript, React, TanStack Router, and Tailwind CSS v4. Prefer existing helpers in `web/src/lib/queries`, `web/src/lib/mutations`, and `web/src/components`. Route files use names such as `_app.$workspaceSlug.issues.$issueId.tsx`.

## Testing Guidelines

Run focused checks before broad checks. For Rust changes, use `cargo check -p <crate>` and add tests near the touched crate when behavior is non-trivial. For frontend changes, run `bun run check`, `bun run lint`, and `bun run build` when routing or bundling changes.

Name tests after behavior. Cover auth, workspace isolation, validation, usage limits, and error paths.

## Commit & Pull Request Guidelines

Recent commits use short imperative or descriptive messages, for example `Improve Discord agent issue flow` or `Add Pro upgrade billing UI`. Keep commits scoped.

Pull requests should include a summary, validation commands, linked issues, and screenshots for UI changes. Call out migrations, new environment variables, public API changes, and deployment impact.

## Security & Configuration Tips

Copy `.env.example` and `web/.env.example` for local setup. Never commit `.env` secrets. Keep API keys, OAuth credentials, JWT secrets, S3 credentials, and webhook secrets in environment variables. Public API, Discord, MCP, and billing changes must preserve workspace isolation and revocation.
