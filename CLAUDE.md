# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`unstatus` is an uptime monitor (Railway-style status pages). A Rust/Axum workspace backs a Bun/Vite React frontend. Monitors are probed by kind (HTTP/TCP/ICMP/Postgres/Redis/SSH) from one or more regions; check results are stored in a TimescaleDB hypertable. Monitors can optionally carry a "monitor-as-code" DSL that decides up/warn/down from probe results.

## Commands

Backend (run from repo root; `just` loads `.env` via `set dotenv-load`):
- `just dev` — run API (`:3000`) and web (`:5173`) together
- `just api` — API only; `just worker` — regional probe worker only
- `just migrate up` (or `just migrate down`, etc.) — SeaORM migrations
- `just check` / `just clippy` (denies warnings) / `just fmt`
- `just icmp-caps` — grant `cap_net_raw` so ICMP/ping checks work without root (Linux)

Frontend (`web/`, Bun only — do not add npm lockfiles):
- `just web-dev`, `just web-build`, `just web-typecheck`
- `just web-gen-api` — regenerate `web/src/lib/api-schema.ts` from the running API's OpenAPI (`http://localhost:3000/api/docs.json`). Run the API first; re-run after changing any API route/response type.
- `cd web && bun run lint` (oxlint) / `bun run format` (oxfmt)

Tests (Rust tests live next to the code they cover):
- `cargo test --workspace`
- `cargo test -p unstatus-dsl` — most tests live here (`crates/dsl/src/tests.rs`)
- Single test: `cargo test -p unstatus-dsl <test_name>`

## Workspace layout

- `crates/api` — Axum server: auth, routes (`src/http/`), scheduler, billing, OpenAPI. Entry: `crates/api/src/main.rs`.
- `crates/probe` — the probe engine: per-kind checks (`http_check.rs`, `tcp_check.rs`, …), `ProbeSpec`/`ProbeOutcome`, and DSL application (`apply_rules`, `resolve_request_headers`). Shared by the API's local worker and the regional worker — probe logic changes go here, not in the API.
- `crates/worker` — standalone regional worker binary (single `main.rs`): heartbeats and claims jobs from the API over HTTP.
- `crates/entity` — SeaORM entities shared by API and migrations.
- `crates/migration` — SeaORM migrations, named `mYYYYMMDD_NNNNNN_*`. The API runs `Migrator::up` on startup, so a new migration applies automatically on next boot.
- `crates/dsl` — the monitor DSL: `lex` → `parse` (→ `ast`) → `validate` → `project` (params/headers) / `eval` (rules). `print` re-serializes; `diagnostic` carries errors. No dependency on the API — a pure pipeline.
- `crates/polar` — standalone typed client for the [Polar](https://polar.sh) billing API (customers, customer state, event ingestion, checkouts, customer sessions, subscriptions, catalog).
- `crates/cloudflare` — standalone typed client for the Cloudflare API: custom hostnames (create/get/delete), fallback origin, DCV-delegation uuid. Backs the custom-domain (Cloudflare for SaaS) flow.
- `web/src` — Vite + React 19 + TanStack Router (file-based) + TanStack Query + Tailwind v4.
- `deploy/cloudflare-worker` — Cloudflare Worker (Workers-as-origin) fronting custom status-page domains via Cloudflare for SaaS; rewrites `Host` to the app origin and passes the real hostname in `X-Forwarded-Host`.

## Backend architecture

**Routing & auth tiers** (`crates/api/src/main.rs`): routes nest under `/api`. Public/unauthed: `/auth/*`, `/public/*`, `/pricing`, invite lookups. Worker-facing routes live under `/internal/workers` authenticated by `WORKER_TOKEN` (not JWT). Everything workspace-scoped lives under `/workspaces/{wid}/...` behind `middleware::workspace_guard`, which resolves `{wid}` (accepts a UUID **or** a slug), confirms the caller is a member, and injects a `Membership { workspace, role }` extension. Owner-only actions call `Membership::require_owner()`. App-admin routes (`http/admin.rs`) gate on the persisted `users.is_admin` flag. Auth is JWT bearer tokens (`auth/jwt.rs`); the `AuthUser` extractor loads the user. When `WEB_DIST_DIR` is set, the API also serves the built frontend as a fallback (SPA).

**AppState** (`crates/api/src/state.rs`) is cloned into every handler and holds: the SeaORM `db` pool, a shared `reqwest` client (redirects disabled — checks see raw responses), `redis` (rate limiting is disabled if `REDIS_URL` is unset), and `check_semaphore` bounding concurrent checks. Optional clients are `None` when their config is absent and degrade gracefully: `billing` (Polar), `cloudflare` (Cloudflare for SaaS custom hostnames), and `loki` (log storage). Two DB URLs: `DATABASE_URL` (direct, for migrations) and `DATABASE_POOLED_URL` (pooled, for the app).

**Scheduling & multi-region workers** — `scheduler::claim_due_region` atomically claims due monitors for a region with `UPDATE ... RETURNING` over `FOR UPDATE SKIP LOCKED` (the locking primitive that makes multiple instances safe). Two consumers:
- The API's in-process local worker (enabled via `API_LOCAL_WORKER_ENABLED`, region `LOCAL_REGION_SLUG`) ticks every `SCHEDULER_TICK_MS`.
- Remote `unstatus-worker` processes poll `/internal/workers` (`http/internal_workers.rs`) to heartbeat, claim leased jobs (`WORKER_LEASE_SECONDS`), and submit results.

Either way the actual probe is `unstatus_probe::run(client, spec, max_body_bytes)`; `scheduler/record.rs` writes results into the `checks` hypertable and updates per-region monitor state. Status convention: `0 = down, 1 = up, 2 = degraded/warn`.

**DSL ↔ probes** — if a monitor has `dsl_source`, `crates/probe` parses it per check. `project()` resolves HTTP request config/headers (including `env("KEY")` lookups at check time — note: env lookups happen on whichever machine runs the probe) before the probe; afterwards `eval_rules` maps the raw outcome to ok/warn/down.

**Billing** (`crates/api/src/billing/`, `http/billing.rs`, `http/pricing.rs`) — optional [Polar](https://polar.sh) integration; disabled when `POLAR_SECRET_KEY` is empty (or the catalog/API is unreachable at startup). At boot the API loads the Polar product catalog into `PolarCatalog` (`billing/catalog.rs`), keyed off product/meter/benefit `metadata` (`tier`/`feature`/`kind`) so entitlements resolve from the customer's **tier** — Polar grants benefits asynchronously, so don't gate on live grants. The workspace UUID is the Polar customer `external_id`. Enforcement (`billing/usage.rs`): `events` is metered consumption (10 units/check, `sum`), while `monitors`/`members` are current-count gauges enforced against the live DB count and billed on the **monthly peak** (`max` meters) — a daily `billing/sweep.rs` re-reports those counts. Gates **fail open** if Polar is unreachable. Features gated: `events`, `monitors`, `members` (metered), `custom_domain`/`one_min_checks`/`five_min_checks`/`multi_region`/`priority_support`/`remove_branding` (boolean perks). When touching limits/checkout flows, keep the no-billing path working.

**Custom domains (Cloudflare for SaaS)** (`crates/api/src/http/custom_domains.rs`, `crates/cloudflare`, `custom_domain_sweep.rs`, `deploy/cloudflare-worker`) — a workspace can serve its public status page from its own hostname. Adding a domain registers a Cloudflare **custom hostname** via `crates/cloudflare`; Cloudflare issues and auto-renews the TLS cert through **TXT DCV delegation** (the customer adds a routing `CNAME → cname.produktive.app` plus an `_acme-challenge` delegation CNAME). A Cloudflare **Worker** on the zone-wide `*/*` route (`deploy/cloudflare-worker`, "Workers-as-origin") passes `produktive.app` and every `*.produktive.app` subdomain through untouched and rewrites only genuine external customer domains: `Host → produktive.app` (so Railway routes it) plus `X-Forwarded-Host` + `X-Produktive-Is-Custom-Domain`. The backend resolves the real hostname from `X-Forwarded-Host` (`custom_domains::host_from_headers`, `spa_meta::host_domain`). `custom_domain_sweep.rs` polls Cloudflare until each cert goes `active`, flipping `verified_at`. The integration is optional: when `CF_API_TOKEN`/`CF_ZONE_ID` are unset, `state.cloudflare` is `None` and custom domains fall back to DNS-TXT verification. Env: `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_FALLBACK_ORIGIN`, `CF_DCV_DELEGATION_UUID`, `CUSTOM_DOMAIN_CNAME_TARGET`. (This replaced a self-hosted Caddy on-demand-TLS proxy.)

**TimescaleDB is required.** The checks migration aborts if the `timescaledb` extension is absent, then `create_hypertable('checks', 'time')`.

## Frontend architecture

- The API client (`web/src/lib/api.ts`) stores the JWT in `localStorage` and prefixes `/api`; Vite proxies `/api` → `:3000` in dev. A 401 clears the token. Request/response types come from generated `api-schema.ts` (keep it in sync via `web-gen-api`).
- Server state goes through TanStack Query (`web/src/lib/queries.ts`); avoid ad-hoc fetches in components.
- Routes are file-based (`web/src/routes/`, generated `routeTree.gen.ts` — don't edit by hand). `_authed.*` is the authenticated layout; `$wid` is the workspace param matching the backend; `s.$slug.tsx` is the public status page.
- The DSL editor uses Monaco with a custom language definition in `web/src/lib/dslLanguage.ts`.

## Design system & styling

Tailwind v4 (via `@tailwindcss/vite`, **no `tailwind.config.js`**) with a CSS-first token layer. Everything lives in `web/src/styles.css`.

**Tokens are CSS custom properties, not Tailwind theme keys.** The `@theme` block in `styles.css` defines the full palette (`--color-*`), radii (`--radius-sm..xl`), shadows (`--shadow-xs..pop`), the focus ring (`--ring-accent`), and the Geist/Geist Mono fonts. The dominant styling idiom is **Tailwind arbitrary-value utilities that reference these vars directly** — `bg-[var(--color-bg-elev)]`, `text-[var(--color-fg-muted)]`, `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-sm)]`. Do **not** reach for semantic Tailwind colors (`bg-white`, `text-gray-500`); always go through a token so theming works. Hover/tint/active states are built with `color-mix(in srgb, var(--color-…) N%, …)` rather than separate tokens — follow that pattern instead of adding one-off colors.

**Token taxonomy** (so you pick the right one):
- Surfaces, lightest-to-deepest intent: `--color-bg` (app shell) · `--color-bg-row` (subtle fill / hover) · `--color-bg-elev` (cards, inputs, raised) · `--color-bg-sunken`.
- Borders, increasing strength: `--color-border` (hairline default) → `--color-border-hi` → `--color-border-strong`.
- Text, decreasing emphasis: `--color-fg` → `--color-fg-muted` → `--color-fg-dim`.
- Emerald accent: `--color-accent` (+ `-hi`, `-soft` tint, `-fg` on-accent text), `--color-link`.
- Status: `--color-ok / -warn / -err / -unknown`.
- `--color-canvas-*` is a **separate dark "editorial" palette** scoped to the React Flow viewport — it stays dark even in light mode. Don't reuse it outside the canvas.

**Theming** is attribute-driven: `data-theme="light" | "dark"` on `<html>`. Both themes re-declare the token set — the scoped light block exists so a light wrapper nested inside a dark ancestor (e.g. a public status page) still renders correctly. Theme is persisted in `localStorage` under `unstatus.theme`, bootstrapped by an **inline script in `web/index.html`** to avoid FOUC, then managed at runtime by `useTheme()` in `web/src/lib/theme.ts`.

**Status is a first-class visual system.** `web/src/lib/status.ts` maps `MonitorStatus` → `STATUS_COLOR`, `STATUS_LABEL`, and `GLOW_CLASS`. The `glow-up/down/warn/unknown` classes (defined in `styles.css`) layer an inset colored ring plus a soft colored drop-shadow. Reuse these maps rather than hardcoding status colors.

**Component conventions:** primitives (`Button`, `Input`, `Segmented`, `StatTile`, …) `forwardRef`, expose `variant`/`size` props backed by `Record<Variant, string>` lookup maps built with `cn()` (a thin `clsx` wrapper in `web/src/lib/cn.ts` — there is no tailwind-merge, so don't rely on later utilities overriding earlier ones), and accept `className` **last** so callers can extend. Inputs wire labels via `useId()`. Icons are `lucide-react`.

**Reusable non-Tailwind classes/animations in `styles.css`:** `.mono`, `.tabular` (tabular-nums for metrics), `.link`, and animations `.spin`, `.pulse-dot`, `.blink-cursor`, `.shimmer` (skeleton loading), `.fade-in`. Global custom scrollbars and the `:where(...)` focus-ring rule (`--ring-accent`) are applied app-wide.

**Third-party libraries are themed through the same tokens in `styles.css`** — sonner toasts, Radix dialog overlay/content animations, React Flow controls/minimap/edges, and Monaco DSL error decorations (`.udsl-error-line`, `.udsl-error-inline`). When adding a new library with its own styles, theme it here against the token set rather than inline.

`oxlint` config is `web/.oxlintrc.json` (correctness = error); `routeTree.gen.ts` is ignored. Formatting is `oxfmt` (no config file — defaults).

## Conventions

- Commits follow Conventional Commits, scoped: `feat(status):`, `fix(dsl):`, `revert(web):`.
- Rust: edition 2021, `rustfmt`, prefer workspace deps from root `Cargo.toml`; modules named by domain (e.g. `probe/src/http_check.rs`).
- Add tests when changing parser, evaluator, probe, migration, scheduler, or API behavior.
- Keep secrets out of git; document new env vars in `.env.example`.
