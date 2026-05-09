# produktive

## What this codebase does

Produktive is a multi-tenant workspace app for issues, projects, notes, chat, public API, MCP, Discord/Slack/GitHub integrations, AI chat, and AI usage billing. The backend is Rust/Axum with SeaORM/Postgres in `crates/api`; shared entities live in `crates/entity`; migrations live in `crates/migration`. The web app is React/TanStack Router/Tailwind in `web/src`. Separate Rust services include `crates/mcp` and `crates/discord-bot`.

## Auth shape

- `require_auth` validates the `produktive_session` JWT cookie, session row, user suspension, active organization, membership, and optional workspace 2FA policy.
- `require_permission` and `has_permission` enforce workspace RBAC. Owners bypass permission checks; custom roles are organization-scoped.
- `require_platform_admin` gates `/api/admin/*` with `platform_admin` rows or `PLATFORM_ADMIN_EMAILS`.
- `require_api_key` verifies Unkey-backed bearer API keys and resolves the active workspace.
- MCP OAuth uses `/api/oauth/*` to issue hashed access/refresh tokens; `ProduktiveAuthProvider::verify_token` validates token hash, grant, resource URL, suspension, and selected workspace membership.

## Threat model

Highest-impact bugs are cross-workspace data access, bypassing RBAC for admin/billing/integrations, leaking or misusing API/OAuth/MCP tokens, and undercharging or bypassing AI usage limits. Attackers may be normal workspace members, invited users with custom roles, linked Discord/Slack users, OAuth/MCP clients, or webhook callers. Any path that accepts workspace/user IDs from the client must re-derive or validate membership against the authenticated context.

## Project-specific patterns to flag

- Query filters on tenant-owned rows should include `auth.organization.id` or a verified organization from `linked_context`; watch issues, projects, labels, notes, chats, chat access, MCP servers, Discord/Slack/GitHub links, billing, and AI usage.
- Mutating issue/project/label/member/billing/integration/admin actions should call `require_permission`, `require_workspace_owner`, or `require_platform_admin` as appropriate.
- Chat access is not just organization membership: `find_chat` and `chat_access` decide visibility before reading messages, attachments, or streaming AI turns.
- Token-bearing integrations should hash or encrypt stored secrets: OAuth tokens are hashed, MCP/Slack/GitHub remote credentials use `encrypt_secret`, and generated API keys store only hashes/prefixes locally.
- AI completions should go through `ai_usage::complete` so plan gating, degradation, normalized units, and usage events are recorded.

## Known false-positives

- `crates/api/src/http/oauth.rs::register_client` is intentionally unauthenticated for MCP dynamic client registration; authorization still requires `require_auth`, PKCE S256, redirect URI matching, and `mcp` scope.
- Public webhook endpoints such as Polar, Slack events/commands, GitHub callbacks, waitlist, unsubscribe, and support email use provider-specific validation or token/state checks instead of session cookies.
- `allow_local_mcp` and local MCP URLs are intended only for local development; production-like config requires `MCP_TOKEN_ENCRYPTION_KEY`.
- S3 object keys are built with `safe_*_key` helpers and `sanitize_filename`; public object URLs may look direct by design.
- Realtime endpoints and dev triggers have local-development/config gating; do not treat every websocket or dev route as public production behavior without checking config.
