# Code Organization

Produktive uses a pragmatic hybrid structure. Do not force one cross-language paradigm across the whole repository.

## Repository boundaries

- `crates/`: Rust deployables and reusable Rust libraries. Crate boundaries are the primary Rust package boundary.
- `web/`: Vite React application. TanStack Router files stay in `web/src/routes`.
- `workers/`: standalone edge workers. Keep each worker self-contained unless shared code is deliberately extracted.
- `docs/`: product, API, and engineering notes.

## Rust crates

Rust should stay crate-first, then domain-oriented inside large binaries.

- `crates/api`: Axum API. Keep HTTP handlers in `src/http`, GraphQL in `src/graphql`, app state/config/error at crate root, and domain services/helpers at crate root when they are shared by multiple transports.
- `crates/entity`: one SeaORM entity module per table. Do not group entities into feature directories.
- `crates/migration`: chronological SeaORM migrations only. Do not rename or reorganize existing migrations.
- `crates/ai`, `crates/polar`, `crates/unkey`: small integration/client crates. Keep the current client/config/error/resources split.
- `crates/discord-bot` and `crates/mcp`: deployable binaries. Prefer small modules by responsibility until they grow enough to justify domain submodules.

Avoid duplicating the same feature in parallel `service`, `repository`, `handler`, and `model` layers unless the boundary is real and shared. For new API behavior, start with the transport module plus a small domain helper only when reuse or testability requires it.

## Web app

The web app is route-driven with feature-adjacent shared code.

- `web/src/routes`: route entrypoints only. Keep route filenames generated/recognized by TanStack Router.
- `web/src/components/ui`: generic primitives with no product data fetching.
- `web/src/components/<feature>`: feature UI such as `issue`, `project`, `chat`, `notes`, `workspace`, `label`, and `onboarding`.
- `web/src/lib/api`: API client modules by backend resource, including handwritten GraphQL transport/helpers in `web/src/lib/api/graphql`.
- `web/src/lib/queries` and `web/src/lib/mutations`: TanStack Query wrappers and cache mutation helpers by resource.
- `web/src/gql` and `web/src/routeTree.gen.ts`: generated files. Do not edit manually.

Use the `@/*` alias for cross-directory imports. Use relative imports only within a tight local module cluster where it improves readability.

## Workers

Workers are deployable boundaries. For a small worker, `src/index.ts` can contain the handler and private helpers. Split into files only after there are independent concerns with tests or meaningful reuse.
