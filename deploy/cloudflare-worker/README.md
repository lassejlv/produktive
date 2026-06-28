# Custom domains via Cloudflare for SaaS — setup runbook

This replaces the self-hosted Caddy on-demand-TLS proxy (`deploy/caddy/`) for status
domains and also fronts deployment custom domains. Cloudflare issues and
**auto-renews** a TLS cert per customer hostname; a Cloudflare **Worker**
(`worker.js`) first asks the API whether the hostname is an active deployment domain.
If it is, the Worker proxies directly to that provider service URL, such as a Cloud
Run `*.run.app` URL. Otherwise it falls back to the status-page app-origin path,
rewriting `Host` exactly like Caddy did.

You can run this **in parallel with Caddy** during testing — the test domain points at a
**new** CNAME target, so existing custom domains keep flowing through Caddy until you
deliberately cut over.

```
app.acme.com ─CNAME→ cname.produktive.app ─→ [Cloudflare edge: TLS + */* Worker]
                                                    │ GET /api/public/deployments/by-domain/app.acme.com
                                                    ├─ deployment domain → Cloud Run / provider URL
                                                    └─ status domain     → app origin with X-Forwarded-Host
```

Customers add **one** DNS record (HTTP DCV validates and renews automatically for
proxied hostnames — no `_acme-challenge`, no TXT).

---

## Prerequisites

- `produktive.app` is on Cloudflare (it is).
- `bun` installed (you already use it); we call wrangler via `bunx`.
- Your **Zone ID** (Cloudflare dashboard → `produktive.app` → Overview → API section).
- The app/API origin host used by the Worker to resolve deployment domains and serve
  status-page fallbacks.

Set shell vars for the API calls below:

```sh
export CF_ZONE_ID="<your zone id>"
export CF_API_TOKEN="<token from Step 4>"
cf() { curl -sS -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" "$@"; }
```

---

## Step 1 — Enable Cloudflare for SaaS

Dashboard → `produktive.app` → **SSL/TLS → Custom Hostnames** → enable / subscribe to
Cloudflare for SaaS. (100 custom hostnames free, then $0.10/hostname/month.)

## Step 2 — Create the customer CNAME target (proxied)

Create a DNS record customers will CNAME to. Use a **new** name so testing doesn't
disturb the existing Caddy target `custom.produktive.app`:

- Dashboard → DNS → Add record:
  - Type `CNAME`, Name `cname`, Target `produktive.app` (or your apex), **Proxied (orange)**.
  - → `cname.produktive.app`

(At cutover you can either keep `cname.produktive.app` or repoint the old
`custom.produktive.app` to Cloudflare — see "Cutover" below.)

## Step 3 — Create the fallback origin (originless)

Cloudflare for SaaS requires a fallback origin. With the `*/*` Worker doing the actual
forwarding, the fallback can be originless:

```sh
# DNS: add an originless AAAA record, proxied.
#   Dashboard → DNS → Add: AAAA  saas-origin  100::  (Proxied)

# Point the zone's SaaS fallback origin at it:
cf -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/custom_hostnames/fallback_origin" \
   --data '{"origin":"saas-origin.produktive.app"}'
```

## Step 4 — Create the API token

Dashboard → My Profile → API Tokens → Create Token → Custom token:
- Permissions: **Zone → SSL and Certificates → Edit**
- Zone Resources: **Include → Specific zone → produktive.app**

Save it as `CF_API_TOKEN` (this is what the backend will use later, too).

## Step 5 — Deploy the Worker + bind the route

1. Edit `wrangler.toml`: set `RAILWAY_ORIGIN_HOST` to the app/API origin host.
2. Deploy:
   ```sh
   cd deploy/cloudflare-worker
   bunx wrangler login        # one-time
   bunx wrangler deploy
   ```
3. Confirm the route. If wrangler didn't attach `*/*`, add it in the dashboard:
   Workers & Pages → your zone → **Workers Routes** → Add route → `*/*` → select
   `produktive-custom-domains`.

---

## Step 6 — End-to-end test with ONE throwaway domain

Use a hostname on a domain you control, e.g. `status.<yourtestdomain>`.

**6a. Point it at the new target (one record):**

```
status.<yourtestdomain>.  CNAME  cname.produktive.app.
```

**6b. Register the custom hostname (HTTP DCV):**

```sh
cf -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/custom_hostnames" \
   --data '{
     "hostname": "status.<yourtestdomain>",
     "ssl": { "method": "http", "type": "dv", "settings": { "min_tls_version": "1.2" } }
   }'
# note the returned .result.id
```

**6c. Poll until the cert is active** (issuance is async, usually < 1–2 min once DNS
resolves):

```sh
cf "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/custom_hostnames/<id>" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(r["status"], r["ssl"]["status"])'
# want:  active active
# lifecycle: pending_validation → pending_issuance → pending_deployment → active
```

**6d. Validate the INFRA layer (TLS + Worker + headers reach Railway):**

```sh
curl -sS -i https://status.<yourtestdomain>/api/health
# Expect: valid TLS (Cloudflare-issued cert), HTTP 200 from the app — NOT a Railway
# "application not found" page (that would mean Host wasn't rewritten correctly).
```

**6e. Validate status-domain fallback** (proves `X-Forwarded-Host` resolution end-to-end).
If you are testing a status page hostname manually, insert a temporary `custom_domains`
row mapping the test host to a workspace whose status page is enabled:

```sql
-- pick a workspace id that has status_page_enabled = true
INSERT INTO custom_domains
  (id, workspace_id, hostname, verification_name, verification_value, verified_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '<workspace-uuid>', 'status.<yourtestdomain>',
   '_produktive.status.<yourtestdomain>', 'manual-test', now(), now(), now());
```

Then open `https://status.<yourtestdomain>/` in a browser → it should render that
workspace's public status page, and `https://status.<yourtestdomain>/api/v2/summary.json`
should return that workspace's summary. **Clean up** the row afterward:

```sql
DELETE FROM custom_domains WHERE hostname = 'status.<yourtestdomain>';
```

**6f. Validate a deployment domain** (proves the hostname resolver and provider proxy):

1. Deploy a Cloud Run-backed service once so it has a provider URL.
2. Add the test hostname in Produktive Deployments -> Domains.
3. Point the hostname CNAME at `cname.produktive.app`.
4. Wait until the domain is active, then open `https://status.<yourtestdomain>/`.
   The Worker should resolve `/api/public/deployments/by-domain/<host>` and proxy to
   the service URL returned by the API.

**6g. Tidy up the test hostname:**

```sh
cf -X DELETE "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/custom_hostnames/<id>"
```

---

## Troubleshooting

- **Status fallback hits the wrong app:** the app-origin rewrite did not reach the API
  service. Confirm `RAILWAY_ORIGIN_HOST` points at the app/API origin and that
  `APP_HOST` is the host the app origin expects.
- **Deployment domain hits the wrong app:** confirm `/api/public/deployments/by-domain/<host>`
  returns the provider URL you expect, then check the service's provider URL directly.
- **Infinite loop / 1042 errors:** the Worker is fetching a host still inside this zone that
  re-triggers `*/*`. Use the app origin host from `wrangler.toml`; if you switch to an
  alternate in-zone origin, make it DNS-only or verify Cloudflare loop prevention still sends
  that subrequest to origin.
- **Cert stuck `pending_validation`:** DNS hasn't propagated, or the hostname isn't yet
  pointing at `cname.produktive.app`. HTTP DCV needs the proxied CNAME live first.

## Rollback

Nothing here touches Caddy or existing domains (the test used `cname.produktive.app`, not
the live `custom.produktive.app`). To abandon: delete the Worker route, the test custom
hostname, and the test DNS records. Caddy keeps serving everything as before.

## Cutover (later, after the backend slice ships)

1. Backfill: create a Cloudflare custom hostname for every existing verified domain.
2. Either tell customers to CNAME to `cname.produktive.app`, **or** (zero customer action)
   repoint the existing `custom.produktive.app` DNS record from the Caddy box to a proxied
   Cloudflare record so their unchanged CNAMEs now resolve to Cloudflare.
3. Once all certs are `active` and traffic is on Cloudflare, decommission the Caddy box and
   delete `deploy/caddy/`.
