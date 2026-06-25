/**
 * Produktive — custom-domain edge proxy ("Workers as origin" for Cloudflare for SaaS).
 *
 * Replaces the self-hosted Caddy on-demand-TLS box (deploy/caddy/). Cloudflare for
 * SaaS terminates TLS for each registered custom hostname (e.g. status.acme.com)
 * using a certificate Cloudflare issues and auto-renews. This Worker — bound to a
 * zone-wide Worker route on the produktive.app zone — then forwards the request to
 * the Railway origin, rewriting Host so Railway routes it and preserving the real
 * hostname so the Axum backend can resolve the right status page.
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

    const appHosts = (env.APP_HOSTS || env.APP_HOST || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    // First-party app traffic (produktive.app, www.produktive.app) passes straight
    // through — the */* route also catches the main app, so we must not rewrite it.
    if (appHosts.includes(incomingHost)) {
      return fetch(request);
    }

    // Custom-domain traffic -> Railway origin, with Host rewritten so Railway routes
    // it to the produktive app. We connect to the Railway service host (outside this
    // Cloudflare zone, so there is no Worker loop) and override the Host header.
    url.hostname = env.RAILWAY_ORIGIN_HOST; // e.g. produktive-api.up.railway.app
    url.protocol = "https:";
    url.port = "";

    const headers = new Headers(request.headers);
    headers.set("Host", env.APP_HOST);
    headers.set("X-Forwarded-Host", incomingHost);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Produktive-Is-Custom-Domain", "true");

    const proxied = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual", // pass the app's own redirects through to the visitor
    });

    return fetch(proxied);
  },
};
