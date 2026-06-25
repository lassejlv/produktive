# Custom domains via Cloudflare for SaaS — setup runbook

This replaces the self-hosted Caddy on-demand-TLS proxy (`deploy/caddy/`). Cloudflare
issues and **auto-renews** a TLS cert per customer hostname; a Cloudflare **Worker**
(`worker.js`) forwards the request to Railway, rewriting `Host` exactly like Caddy did.

You can run this **in parallel with Caddy** during testing — the test domain points at a
**new** CNAME target, so existing custom domains keep flowing through Caddy until you
deliberately cut over.

```
status.acme.com ─CNAME→ cname.produktive.app ─→ [Cloudflare edge: TLS + */* Worker]
                                                        │ Host: produktive.app
                                                        │ X-Forwarded-Host: status.acme.com
                                                        ▼
                                                 Railway origin → Axum app
```

Customers add **one** DNS record (HTTP DCV validates and renews automatically for
proxied hostnames — no `_acme-challenge`, no TXT).

---

## Prerequisites

- `produktive.app` is on Cloudflare (it is).
- `bun` installed (you already use it); we call wrangler via `bunx`.
- Your **Zone ID** (Cloudflare dashboard → `produktive.app` → Overview → API section).
- The Railway **origin host** for the API service (Railway → API service → Settings →
  Networking → Public Networking → the `*.up.railway.app` domain).

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

1. Edit `wrangler.toml`: set `RAILWAY_ORIGIN_HOST` to your `*.up.railway.app` host.
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

**6e. Validate the FULL page render** (proves `X-Forwarded-Host` resolution end-to-end).
Because the backend isn't wired to Cloudflare yet, insert a temporary `custom_domains`
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

> Note: `summary.json` currently has a latent host-resolution bug (`summary_by_host`
> reads only `Host`, which the Worker rewrites). If it 404s while the page renders fine,
> that's the known bug to fix in the backend slice (shared `request_host` helper).

**6f. Tidy up the test hostname:**

```sh
cf -X DELETE "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/custom_hostnames/<id>"
```

---

## Troubleshooting

- **Railway "application not found" / wrong app:** the `Host` rewrite didn't take. Confirm
  `RAILWAY_ORIGIN_HOST` is the API service's `*.up.railway.app` host and that
  `produktive.app` is a configured custom domain on that Railway service. If Workers won't
  forward a custom `Host` to the railway.app origin, use the **grey-cloud alternative**:
  create `origin.produktive.app` as a **DNS-only (grey)** record to Railway and set
  `RAILWAY_ORIGIN_HOST=origin.produktive.app` (Railway must have that as a custom domain).
- **Infinite loop / 1042 errors:** the Worker is fetching a host still inside this zone that
  re-triggers `*/*`. The origin must be outside the zone (the `*.up.railway.app` host) or a
  grey-clouded record.
- **Cert stuck `pending_validation`:** DNS hasn't propagated, or the hostname isn't yet
  pointing at `cname.produktive.app`. HTTP DCV needs the proxied CNAME live first.
- **`summary.json` 404 on a custom domain but page renders:** expected until the backend
  `request_host` fix lands (see the migration plan).

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
