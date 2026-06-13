# Repository Guidelines

## Project Structure & Module Organization

This repository is a Rust workspace with a Bun-powered React frontend.

- `crates/api`: Axum API server, auth, routes, scheduler checks, and OpenAPI.
- `crates/entity`: SeaORM entities shared by API and migrations.
- `crates/migration`: SeaORM migrations. Add timestamped `mYYYYMMDD_NNNNNN_*` files.
- `crates/dsl`: monitor-as-code DSL lexer, parser, validator, evaluator, and tests.
- `crates/autumn`: billing/client integration code.
- `web/src`: Vite React app with TanStack Router routes, components, helpers, and CSS.
- `web/public`: static web assets.

## Build, Test, and Development Commands

Use Bun for frontend work; do not introduce npm workflow files.

- `specific docs`: read Specific docs before changing infrastructure or dev environments.
- `specific dev`: run the full local development environment when Specific config is present.
- `specific check`: validate `specific.hcl` after any Specific configuration change.
- `just api`: run the Rust API on `:3000`.
- `just dev`: run API and frontend together using the current local shell environment.
- `just migrate up`: run database migrations.
- `just check`: run `cargo check --workspace`.
- `just clippy`: run Rust lints with warnings denied.
- `just fmt`: format Rust code.
- `just web-dev`: run the Vite frontend on `:5173`.
- `just web-build`: build the frontend.
- `just web-typecheck`: run TypeScript type checks.

## Coding Style & Naming Conventions

Rust uses edition 2021 and `rustfmt`; keep modules small and named by domain, such as `scheduler/http_check.rs`. Prefer workspace dependencies from root `Cargo.toml`.

Frontend code uses TypeScript, React, TanStack Router, Tailwind CSS v4, `oxfmt`, and `oxlint`. Components use PascalCase filenames. Routes follow TanStack Router conventions.

## Testing Guidelines

Run focused tests during development and workspace checks before submitting. Rust tests live next to implementation files. Use:

- `cargo test --workspace`
- `cargo test -p unstatus-dsl`
- `cd web && bun run typecheck`

Add tests for parser, evaluator, migration, scheduler, or API behavior changes.

## Commit & Pull Request Guidelines

Recent commits use concise Conventional Commit style, for example `feat(status): ...`, `fix(dsl): ...`, and `revert(web): ...`. Keep subjects imperative and scoped when useful.

Pull requests should describe the change, list validation commands, link issues, and include screenshots for visible frontend changes. Note migrations or environment changes.

## Security & Configuration Tips

Keep secrets out of git. Use `.env.example` only for documented placeholders. Infrastructure, services, databases, secrets, and workflows should be modeled in Specific via `specific.hcl`; always run `specific check` after editing it.
