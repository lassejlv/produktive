# Claude working notes for this repo

## Workflow

- **Package manager: bun.** Use `bun install`, `bun run dev`, `bun run check`, `bun run lint`, etc. for the `web/` workspace. Don't reach for npm.
- **Commit messages: no co-author trailer.** Don't append `Co-Authored-By: Claude…` (or any AI attribution) to commits.
- **Pushing: only when explicitly asked.** After committing, do not ask "want me to push?" or otherwise prompt about pushing — assume the user will say so when ready. If they ask to push, just do it.

## Project layout

- Rust backend: `crates/api`, `crates/entity`, `crates/migration`. SeaORM + Postgres.
- Web frontend: `web/` (Vite + React + TanStack Router/Query, Tailwind v4).
- Build commands inside `web/`: `bun run check` (tsc --noEmit), `bun run lint` (oxlint), `bun run dev` (Vite).
- Backend build: `cargo build -p produktive-api` from repo root.
