# Hetzner Caddy Custom Domain Proxy

This proxy terminates TLS for customer status page domains and forwards traffic to
the existing Produktive app at `https://produktive.app`.

## DNS

Point the shared CNAME target at the Hetzner server:

```text
custom.produktive.app A <hetzner-ipv4>
custom.produktive.app AAAA <hetzner-ipv6>
```

Customers then point their domains at the proxy:

```text
status.customer.com CNAME custom.produktive.app
```

For apex domains, use `A` and optional `AAAA` records to the Hetzner server
unless the DNS provider supports CNAME flattening.

## Deploy

```sh
cp .env.example .env
docker compose up -d
```

`ACME_EMAIL` is used for certificate issuance. `PRODUKTIVE_ORIGIN` should remain
`https://produktive.app` unless the production app origin changes.

## How It Works

Caddy uses on-demand TLS and asks Produktive before issuing a certificate:

```text
GET https://produktive.app/api/public/custom-domains/authorize?domain=<domain>
```

Produktive returns `200` only when the custom domain is registered, the `_produktive`
TXT verification record has been confirmed, and its workspace status page is
enabled. Unknown or unverified domains return `404`, so Caddy will not issue
certificates for them.

Requests are reverse-proxied to `https://produktive.app`. The frontend detects the
browser hostname and renders the matching custom-domain status page at `/`, so
the customer's domain stays clean in the address bar.
