/**
 * Produktive — custom-domain edge proxy ("Workers as origin" for Cloudflare for SaaS).
 *
 * Replaces the self-hosted Caddy on-demand-TLS box (deploy/caddy/). Cloudflare for
 * SaaS terminates TLS for each registered custom hostname using a certificate
 * Cloudflare issues and auto-renews. This Worker is bound to a zone-wide route on
 * produktive.app and handles two custom-domain products:
 *
 * - deployment domains: resolve the hostname through the API, then proxy directly
 *   to the provider service URL (Cloud Run `*.run.app`, etc.).
 * - status-page domains: fall back to the main app origin, rewriting Host so the
 *   backend can resolve the public status page from X-Forwarded-Host.
 *
 * Header contract — MUST match the backend host resolution
 * (crates/api/src/http/spa_meta.rs `host_domain`, and the shared `request_host`
 * helper once the summary_by_host bug is fixed):
 *   Host:                          APP_HOST (produktive.app) — Railway routes on this
 *   X-Forwarded-Host:              the customer's real hostname (status.acme.com)
 *   X-Produktive-Is-Custom-Domain: "true"
 *   X-Forwarded-Proto:             "https"
 *
 * This is intentionally identical to what deploy/caddy/Caddyfile does today, so no
 * backend code has to change to make the proxy swap work.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const incomingHost = url.hostname.toLowerCase();

    // Everything in the app's own zone — produktive.app AND any *.produktive.app
    // subdomain (cdn, www, the SaaS fallback/cname records, future subdomains) —
    // passes straight through unchanged. The */* route catches the whole zone, but
    // only genuine EXTERNAL customer domains (e.g. status.acme.com) get rewritten to
    // the app origin. This avoids hijacking first-party subdomains like cdn (R2).
    const appZone = (env.APP_ZONE || "produktive.app").toLowerCase();
    if (incomingHost === appZone || incomingHost.endsWith("." + appZone)) {
      return fetch(request);
    }

    const deployTarget = await resolveDeployTarget(incomingHost, env);
    if (deployTarget) {
      return proxyToDeployTarget(request, incomingHost, deployTarget);
    }

    return proxyToAppOrigin(request, incomingHost, env);
  },
};

async function resolveDeployTarget(incomingHost, env) {
  const originHost = env.RAILWAY_ORIGIN_HOST || env.APP_HOST;
  if (!originHost || !env.APP_HOST) {
    return null;
  }

  const url = new URL(
    `/api/public/deployments/by-domain/${encodeURIComponent(incomingHost)}`,
    `https://${originHost}`,
  );
  const headers = new Headers({ Accept: "application/json" });
  headers.set("Host", env.APP_HOST);

  try {
    const response = await fetch(url.toString(), {
      headers,
      cf: { cacheTtl: 15, cacheEverything: true },
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return typeof data.url === "string" && data.url.length > 0 ? data.url : null;
  } catch {
    return null;
  }
}

function proxyToDeployTarget(request, incomingHost, deployTarget) {
  const url = new URL(request.url);
  const target = new URL(deployTarget);
  url.protocol = target.protocol;
  url.hostname = target.hostname;
  url.port = target.port;

  const headers = new Headers(request.headers);
  headers.set("Host", target.host);
  headers.set("X-Forwarded-Host", incomingHost);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Produktive-Deploy-Custom-Domain", "true");

  return fetch(
    new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}

function proxyToAppOrigin(request, incomingHost, env) {
  const url = new URL(request.url);
  url.hostname = env.RAILWAY_ORIGIN_HOST;
  url.protocol = "https:";
  url.port = "";

  const headers = new Headers(request.headers);
  headers.set("Host", env.APP_HOST);
  headers.set("X-Forwarded-Host", incomingHost);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Produktive-Is-Custom-Domain", "true");

  return fetch(
    new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}
