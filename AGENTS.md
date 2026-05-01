# Repository Guidelines

## Project Structure & Module Organization

Produktive is a Rust workspace with a Bun/Vite React frontend:

- `crates/api`: Axum HTTP API, auth, billing, AI chat, integrations.
- `crates/mcp`: standalone Produktive MCP server.
- `crates/entity`: shared SeaORM entities.
- `crates/migration`: SeaORM migrations. Do not hand-write ad hoc SQL.
- `crates/ai`, `crates/polar`: service/client helpers.
- `web/src`: React routes, components, hooks, queries, mutations.
- `web/public` and `web/index.html`: browser assets and HTML shell.
- `docs`: contributor and product/API docs.

## Build, Test, and Development Commands

Use Bun for frontend tasks and Cargo for Rust:

- `just dev`: run the Rust API and Vite web app together.
- `just api`: run only `produktive-api`.
- `just web`: run only the Vite dev server.
- `just migrate`: run database migrations.
- `just check`: run `cargo fmt --check`, `cargo check`, and web typecheck.
- `just build`: build release API and production web bundle.
- `cargo check -p produktive-api`: focused backend check.
- `cargo check -p produktive-mcp`: focused MCP server check.
- `cd web && bun run lint`: run Oxlint.
- `cd web && bun run format:check`: check Oxfmt formatting.

## Coding Style & Naming Conventions

Rust uses edition 2021 and `cargo fmt`. Keep boundaries clear: database models in `crates/entity`, HTTP handlers in `crates/api/src/http`, MCP-specific behavior in `crates/mcp`.

Frontend code is TypeScript/React with Tailwind CSS v4. Prefer existing `web/src/lib/queries`, `web/src/lib/mutations`, and component patterns. Route files use TanStack naming such as `_app.issues.$issueId.tsx`.

## Testing Guidelines

Run focused checks before broad ones. For backend changes, prefer `cargo check -p <crate>` and add Rust tests near the touched crate when behavior is non-trivial. For frontend changes, run `bun run check`, `bun run lint`, and `bun run build` when HTML, routing, or bundling changes.

Name tests after behavior. Cover auth, workspace isolation, validation, and error paths for API changes.

## Commit & Pull Request Guidelines

Recent commits use short imperative or descriptive messages, for example `Update index.html` or `Default tab bar off and surface it in onboarding`. Keep commits scoped.

Pull requests should include a summary, validation commands, linked issues, and screenshots for UI changes. Call out migrations, new env vars, public API changes, or deployment-impacting behavior.

## Security & Configuration Tips

Copy `.env.example` and `web/.env.example` for local setup. Never commit `.env` secrets. Keep API keys, OAuth credentials, JWT secrets, S3 credentials, and billing tokens in environment variables. Public API and MCP key changes must preserve workspace isolation and revocation.
