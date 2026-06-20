# Handoff: Public incident detail pages (`/incidents/:id`)

## Goal

Add dedicated **public incident detail pages** for status pages. Each page shows a single incident with its full update timeline. Users reach it by clicking an incident row from the status page, incident history, or mini history.

**No new backend API is required.** The public status payload already includes all incidents with nested `updates[]`. The detail page looks up the incident by `id` from the same query cache used by the list pages.

---

## Three public status contexts

Public status is served in three ways. **All three need incident detail routes.**

| Context | Status URL | Incidents list | Incident detail (target) |
|---------|------------|----------------|--------------------------|
| **Slug on app origin** | `/s/{slug}` | `/s/{slug}/incidents` | `/s/{slug}/incidents/{id}` |
| **Custom domain** | `/` (root) | `/incidents` | `/incidents/{id}` |
| **Editor preview** | N/A (in-app) | N/A | Links omitted (`href` undefined) |

### Route files (TanStack Router, file-based)

| File | Route | Status |
|------|-------|--------|
| `web/src/routes/s_.$slug.index.tsx` | `/s/$slug/` | Exists |
| `web/src/routes/s_.$slug.incidents.tsx` | `/s/$slug/incidents` | Exists |
| `web/src/routes/s_.$slug.incidents.$id.tsx` | `/s/$slug/incidents/$id` | **NOT YET CREATED** |
| `web/src/routes/index.tsx` | `/` | Custom domain → `PublicStatusByDomain` |
| `web/src/routes/incidents.tsx` | `/incidents` | Custom domain incidents list |
| `web/src/routes/incidents.$id.tsx` | `/incidents/$id` | **NOT YET CREATED** |

Note: TanStack file routes use `s_.$slug` (underscore) in filenames but URLs are `/s/{slug}`.

---

## What's already done

### 1. `IncidentDetailView.tsx` (complete UI component)

**Path:** `web/src/components/status/IncidentDetailView.tsx`

- Uses `StatusShell` (shared chrome: theme, logo, footer)
- Shows incident heading, severity badge, active/resolved status, start/resolve times, duration
- Renders **Updates** section: sorted newest-first, status label + relative + absolute time + message
- Props: `title`, `incident`, `incidentsHref` (back link), `style`, `showBranding`
- Sets `documentTitle` to `{title} — {incident heading}`

### 2. `Incidents.tsx` (clickable rows)

**Path:** `web/src/components/status/Incidents.tsx`

- `IncidentRow` accepts optional `href`; renders as `<a>` with hover when set
- `ActiveIncidents`, `IncidentList`, `MiniIncidentHistory` accept `incidentsHref` (base path)
- Rows link to `${incidentsHref}/${incident.id}` when base is provided
- `MiniIncidentHistory` uses `href` prop (same pattern: `${href}/${id}` for rows, `href` for "View all")

### 3. Wiring from status/list pages to detail links

- `StatusView` passes `incidentsHref` → `ActiveIncidents` and `MiniIncidentHistory`
- `IncidentsView` passes `incidentsHref={statusHref.replace(/\/?$/, "") + "/incidents"}` to `IncidentList`
- Slug pages: `incidentsHref={\`/s/${slug}/incidents\`}` in `s_.$slug.index.tsx`
- Custom domain: `incidentsHref="/incidents"` in `PublicStatusByDomain.tsx`

**Important:** Links are already generated, but **routes don't exist yet** — clicking a row will 404 until detail routes are added.

---

## What remains (implementation checklist)

### A. Create slug incident detail route

**New file:** `web/src/routes/s_.$slug.incidents.$id.tsx`

Pattern (mirror `s_.$slug.incidents.tsx`):

```tsx
export const Route = createFileRoute("/s_/$slug/incidents/$id")({ ... });
```

Logic:
1. `useParams()` → `slug`, `id`
2. `usePublicStatus(slug)` — same hook as list page
3. Loading/error states via `FullPageSpinner` / `PublicStatusError`
4. Find incident: `data.incidents?.find(i => i.id === id)`
5. If not found → `PublicStatusError` with appropriate message
6. Render `IncidentDetailView` with:
   - `title={data.title ?? data.workspace_name}`
   - `incident={found}`
   - `incidentsHref={\`/s/${slug}/incidents\`}`
   - `style`, `showBranding` from data

Consider extracting a small shared helper:

```tsx
function findPublicIncident(incidents: PublicIncident[], id: string) {
  return incidents.find((i) => i.id === id) ?? null;
}
```

### B. Create custom-domain incident detail route

**New file:** `web/src/routes/incidents.$id.tsx`

Pattern (mirror `incidents.tsx`):

```tsx
export const Route = createFileRoute("/incidents/$id")({ ... });
```

Logic:
1. Resolve domain via `customStatusDomain()` + optional `?domain=` search param (same as `incidents.tsx`)
2. `usePublicStatusByDomain(domain)`
3. Find incident by `id`, render `IncidentDetailView` or error
4. `incidentsHref="/incidents"`

**Alternative:** Extend `PublicStatusByDomain` with a third view mode:

```tsx
view?: "status" | "incidents" | "incident-detail"
incidentId?: string
```

Both route files could delegate to this component to avoid duplication. Current component only supports `"status" | "incidents"`.

### C. Regenerate route tree

After adding route files, run the TanStack Router codegen (whatever the project uses — likely `npm run dev` or a dedicated script in `web/package.json`). Check for `routeTree.gen.ts` updates.

### D. Backend SPA meta routes (server-side HTML for direct loads / link unfurls)

**Path:** `crates/api/src/http/spa_meta.rs`

Currently serves injected `index.html` for:
- `/s/{slug}`
- `/s/{slug}/incidents`
- `/` (custom domain)
- `/incidents` (custom domain)

**Missing routes for incident detail (direct navigation / refresh will work via SPA fallback, but meta injection won't run on first paint):**
- `/s/{slug}/incidents/{id}` — add `.route("/s/{slug}/incidents/{id}", get(slug_html))` or a dedicated handler
- `/incidents/{id}` — add `.route("/incidents/{id}", get(domain_html))`

The existing handlers use generic workspace meta ("Acme — Status"). Optional enhancement: inject incident-specific title/description for OG tags on detail pages (would need DB lookup by incident id). **Not required for MVP** — SPA sets `document.title` client-side via `IncidentDetailView`.

### E. Caddy / proxy

**Path:** `deploy/caddy/Caddyfile`

Custom domains reverse-proxy all paths to app origin. No Caddy changes needed for `/incidents/{id}` — already forwarded.

---

## Data model (reference)

**Path:** `web/src/lib/types.ts`

```typescript
export interface PublicIncident {
  id: Uuid;
  monitor_id: Uuid | null;
  monitor_name: string | null;
  monitor_slug: string | null;
  title: string;
  source: "automatic" | "manual";
  status: IncidentStatus;
  severity: IncidentSeverity;
  started_at: Iso;
  last_seen_at: Iso;
  resolved_at: Iso | null;
  updates: PublicIncidentUpdate[];
}

export interface PublicIncidentUpdate {
  id: Uuid;
  incident_id: Uuid;
  status: IncidentUpdateStatus;
  message: string;
  created_at: Iso;
}
```

## API / queries (reference)

**Path:** `web/src/lib/queries.ts`

```typescript
usePublicStatus(slug)        → GET /public/status/{slug}
usePublicStatusByDomain(domain) → GET /public/status/by-domain/{domain}
```

Both return `PublicStatus` which includes `incidents: PublicIncident[]` with nested updates.

Backend incident assembly: `crates/api/src/http/public_status.rs` → `public_incidents()`.

---

## Component map

```
StatusShell          — shared layout (header, theme, footer, copy link)
StatusView           — main status page (uses ActiveIncidents, MiniIncidentHistory)
IncidentsView        — incident history page (uses IncidentList)
IncidentDetailView   — incident detail page (uses StatusShell) ✅ DONE
Incidents.tsx        — IncidentRow, ActiveIncidents, IncidentList, MiniIncidentHistory ✅ DONE
PublicStatusByDomain — router component for custom domain pages
PublicStatusError    — error/not-found UI for public pages
```

---

## URL conventions (important)

- Slug routes use **`/s/{slug}`** in hrefs (no underscore). File routes use `s_.$slug`.
- `IncidentsView` builds list base as: `${statusHref.replace(/\/?$/, "")}/incidents`
  - Slug: `statusHref=/s/acme` → list at `/s/acme/incidents` → detail at `/s/acme/incidents/{id}` ✓
  - Custom domain: `statusHref=/` → list at `/incidents` → detail at `/incidents/{id}` ✓
- Editor preview: `StatusView` with `preview={true}` should omit `incidentsHref` so rows aren't links

---

## Git status at handoff time

Modified (may be unrelated WIP from another task):
- `crates/api/src/http/public_status.rs`
- `crates/api/src/http/spa_meta.rs`
- `deploy/caddy/Caddyfile`

Incident detail frontend work appears to be **uncommitted** new/modified files under `web/src/components/status/`.

---

## Suggested test plan

1. **Slug path:** Visit `/s/{slug}`, click incident in active list / mini history → lands on `/s/{slug}/incidents/{id}` with timeline
2. **Slug list:** Visit `/s/{slug}/incidents`, click row → detail page
3. **Custom domain:** On verified custom domain, `/` → click incident → `/incidents/{id}`
4. **Custom domain list:** `/incidents` → click row → detail
5. **Back navigation:** "Back to incidents" returns to list; status page links still work
6. **Not found:** Invalid UUID / wrong id → friendly error
7. **Direct load / refresh:** Detail URL loads without 404 (SPA route + optional spa_meta route)
8. **Preview mode:** Status page editor preview — incident rows should NOT be links
9. **Open vs resolved:** Both show correct badge, duration on resolved
10. **Updates:** Manual incidents with posted updates render timeline; empty updates show placeholder

---

## Out of scope (unless requested)

- Authenticated workspace incident detail (`/_authed/$wid/incidents`) — separate admin UI at `web/src/routes/_authed.$wid.incidents.tsx`
- Dedicated per-incident API endpoint
- Incident-specific OG meta injection on server
- Statuspage.io JSON feed shortlinks (backend already builds `{page_url}/incidents` base in `public_status.rs`)

---

## Quick start for next agent

1. Create `web/src/routes/s_.$slug.incidents.$id.tsx`
2. Create `web/src/routes/incidents.$id.tsx` (or extend `PublicStatusByDomain`)
3. Run route codegen / verify app builds
4. Optionally add spa_meta routes for direct-load HTML
5. Manual test all three contexts above
