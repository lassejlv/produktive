# Privacy Policy

**Effective date:** 2026-06-15

This Privacy Policy explains how **produktive** ("produktive", "we", "us", or "our") collects, uses, shares, and protects personal data when you use the produktive uptime‑monitoring and status‑page service at **https://produktive.app** and related subdomains (the "Service").

produktive is operated from Denmark and is intended to comply with the EU General Data Protection Regulation (GDPR) and Danish data‑protection law.

produktive is operated as a **sole proprietorship (enkeltmandsvirksomhed) established in Denmark**.

> TODO(confirm): Owner/proprietor name, company registration number (CVR), and registered postal address of the controller.

**Data controller:** produktive — a sole proprietorship in Denmark (TODO(confirm): owner name, CVR, address).
**Privacy contact:** support@produktive.app

> This document is a practical draft prepared from the product's actual behaviour. It is not legal advice; please have it reviewed by qualified counsel before publishing.

---

## 1. Who this policy applies to

- **Account users** — people who register, sign in, and operate workspaces, monitors, status pages, and logs.
- **Invited members** — people invited by email to join a workspace.
- **Visitors to public status pages** — people who view a workspace's published status page (including pages served on custom domains).
- **Senders of log data** — applications or systems that ship log events to the Service using an ingest token.

For data you submit *about your own end users* (for example, log events you ingest, or the content of incident updates), you act as the controller and produktive acts as your processor. See [Section 9](#9-data-you-process-through-produktive-controllerprocessor-roles).

---

## 2. Personal data we collect

We collect only what the Service needs to function. The categories below reflect what the application actually stores.

### 2.1 Account and authentication data
- **Email address** — required to create an account and sign in (`users.email`).
- **Password** — stored only as an **Argon2 salted hash**; we never store or have access to your plaintext password (`crates/api/src/auth/password.rs`).
- **GitHub identity** — if you sign in with GitHub, we store your GitHub user ID and your verified primary email (`crates/api/src/auth/routes.rs`). We do not store your GitHub password.
- **Session metadata** — for each active session we store a hashed session token, the **IP address** and **User‑Agent** of the request, and the session creation/expiry times (`sessions` table). This is used for authentication and account security.

### 2.2 Workspace and collaboration data
- Workspace name, slug, and settings; your role (owner or member); and, for invitations, the **invitee's email address** and who sent the invite (`workspaces`, `workspace_members`, `workspace_invites`).

### 2.3 Monitoring configuration and results
- **Monitor configuration** you create: name, target URL/host, check type (HTTP/TCP/ICMP/PostgreSQL/Redis/SSH), interval, timeout, expectations, and any optional "monitor‑as‑code" DSL source (`monitors` table).
- **Check results**: timestamp, region, up/down/degraded status, latency, HTTP status code, and an **error message** when a check fails (`checks` hypertable). We do **not** store full HTTP response bodies; however, error messages can contain fragments of a target's response.
- **Incidents and incident updates**, including titles and free‑text update messages and the author (`incidents`, `incident_updates`).
- **Notification channels** (e.g. webhook/Slack/Discord URLs) and a record of notifications sent and their delivery status (`notification_channels`, `notifications`, `notification_deliveries`).

> Note: Monitor targets and DSL sources are user‑supplied and may, if you choose, contain credentials or connection strings. We recommend supplying secrets via environment lookups rather than embedding them in monitor fields. See [Section 11](#11-your-responsibilities-and-security-recommendations).

### 2.4 Custom domain data
- The custom hostname you connect for a status page and the DNS verification records used to validate ownership (`custom_domains`).

### 2.5 Billing data
- If you subscribe to a paid plan, billing is handled by our payment processor **Polar** (see [Section 8](#8-third-parties-and-subprocessors)). We store your Polar customer ID, plan, subscription status, billing period, and a copy of the customer state returned by Polar, which **may include billing address details** (`workspace_billing_states`). We also retain Polar webhook event records for reconciliation (`polar_webhook_events`).
- **We do not store full payment‑card numbers.** Card data is handled by Polar and its payment processors.

### 2.6 Log data you ingest (optional feature)
- If you use the logs feature, you (or your systems) send **arbitrary structured log events** to the Service using an ingest token. These events are stored in object storage with a per‑project retention period you set (**1–90 days; default 14 days**) (`log_projects`, `crates/api/src/http/logs.rs`).
- We do not impose a schema on, or filter, the contents of your log events. **Do not send personal or sensitive data in log events unless you have a lawful basis to do so and have configured an appropriate retention period.**

### 2.7 Data stored in your browser
- We store a **JWT authentication token** and your **theme preference** in your browser's `localStorage` (`unstatus.token`, `unstatus.theme`). These remain on your device and are not third‑party tracking cookies. See [Section 12](#12-cookies-and-local-storage).

### 2.8 What we do **not** do
- We do **not** use third‑party analytics, advertising, or behavioural‑tracking tools, and we have no advertising cookies.
- We do **not** use AI/LLM providers to process your data.
- We do **not** sell personal data.

---

## 3. How we use personal data, and our legal bases

| Purpose | Data used | Legal basis (GDPR Art. 6) |
|---|---|---|
| Create and operate your account; authenticate you | Email, password hash, GitHub ID, session data | Performance of a contract (Art. 6(1)(b)) |
| Provide monitoring, status pages, incidents, notifications, and logs | Monitor config, check results, incidents, channels, log data | Performance of a contract (Art. 6(1)(b)) |
| Send invitations you initiate | Invitee email, inviter email, workspace name | Performance of a contract / legitimate interests (Art. 6(1)(b),(f)) |
| Account security, abuse prevention, and rate limiting | IP address, User‑Agent, session metadata, rate‑limit counters | Legitimate interests (Art. 6(1)(f)) |
| Process subscriptions and payments | Billing/customer data | Performance of a contract (Art. 6(1)(b)); legal obligation for tax/accounting (Art. 6(1)(c)) |
| Send service/transactional emails (e.g. invitations) | Email address | Performance of a contract / legitimate interests (Art. 6(1)(b),(f)) |
| Comply with legal obligations and enforce our Terms | As needed | Legal obligation / legitimate interests (Art. 6(1)(c),(f)) |

We do not currently send marketing email. TODO(confirm): if marketing is added, it will rely on consent (Art. 6(1)(a)) with an opt‑out.

---

## 4. Public status pages

When a workspace enables a public status page, the information on that page is **publicly accessible without authentication**, including monitor display names, current and historical status (rolling history window), and any incidents and incident updates you publish. Do not include personal or confidential information in monitor names, incident text, or status‑page configuration that you do not wish to make public.

---

## 5. Retention

| Data | Retention |
|---|---|
| Account data (email, password hash) | For the life of your account; deleted on account deletion (see [Section 7](#7-your-rights)). |
| Sessions | Until expiry (token lifetime, default 30 days) or sign‑out; expired sessions are purged by a scheduled cleanup job. |
| Workspace invitations | Until accepted or expiry (7 days). |
| Check results | Retained as time‑series data; status pages display a rolling history window (90 days by default). TODO(confirm): any longer back‑end retention or compression policy on the `checks` hypertable. |
| Incidents / notifications | For the life of the workspace unless deleted. |
| Ingested log events | Per‑project retention you configure (1–90 days; default 14). Deleted when the log project is deleted. |
| Billing records | Retained for **5 years** in accordance with Danish bookkeeping law (bogføringsloven), as required for tax/accounting purposes. |

When you delete a workspace, associated monitors, members, invites, incidents, and related records are removed by cascading deletion.

---

## 6. Where your data is stored and processed

The Service is hosted in the **European Union**. Primary infrastructure:

- **Application/API hosting** — AWS, EU (eu‑central) region. TODO(confirm): exact hosting platform (referenced as Unkey/unkey.app) and region.
- **Primary database** (PostgreSQL/TimescaleDB) — **Neon**, running on AWS in the EU. TODO(confirm): exact region.
- **Cache / rate limiting** — **Upstash** Redis on AWS, eu‑central.
- **Log object storage** — **Hetzner** Object Storage, Falkenstein, Germany (EU).
- **Custom‑domain reverse proxy** — **Hetzner**, Falkenstein, Germany.
- **Transactional email** — **Cloudflare**.

Most processing occurs within the EU/EEA. Where a subprocessor processes data outside the EEA, we rely on an appropriate transfer mechanism (such as the EU Standard Contractual Clauses). See each provider's terms in [Section 8](#8-third-parties-and-subprocessors). TODO(confirm): document the transfer mechanism for any non‑EEA processing (e.g. Polar billing).

---

## 7. Your rights

If you are in the EEA/UK, you have the right to: access your data; rectify inaccurate data; erase data ("right to be forgotten"); restrict or object to processing; data portability; and withdraw consent where processing is based on consent. You also have the right to lodge a complaint with a supervisory authority — in Denmark, the **Datatilsynet** (Danish Data Protection Agency, www.datatilsynet.dk).

To exercise any right, contact **support@produktive.app**. We will respond within the time limits required by law (generally one month under GDPR).

**Account deletion / export:** There is currently no self‑service deletion button in the app. To delete your account or request an export of your personal data, email **support@produktive.app** and we will action your request within the time limits required by law.

---

## 8. Third parties and subprocessors

We share personal data with the following processors only as needed to run the Service. Several integrations are optional and only apply if enabled.

| Subprocessor | Purpose | Data shared | Location |
|---|---|---|---|
| **Neon** | Primary application database (Postgres/TimescaleDB) | All stored account and service data | AWS, EU (TODO(confirm): region) |
| **Upstash** | Redis cache / rate limiting | Transient rate‑limit counters keyed by email/IP | AWS, eu‑central |
| **Hetzner** | Object storage for ingested logs; reverse proxy for custom status‑page domains | Log event contents; inbound requests to custom domains, TLS termination | Falkenstein, Germany |
| Application hosting (AWS / Unkey — TODO(confirm)) | Runs the API and web app | All processed data in transit/compute | EU (eu‑central) |
| **Polar** (polar.sh) | Subscriptions, checkout, payments, metered billing | Workspace identifier, account email, plan/usage data; billing details handled by Polar | TODO(confirm): location & transfer mechanism |
| **Cloudflare** | Sending transactional email (e.g. invitations) | Recipient email, inviter email, workspace name | Cloudflare global network |
| **GitHub** (optional, if you use GitHub sign‑in) | OAuth authentication | OAuth identifiers, your verified email | Provided by GitHub/Microsoft |

We will keep this list current.

---

## 9. Data you process through produktive (controller/processor roles)

For your **account and billing data**, produktive is the **controller**.

For **content you put into the Service about third parties** — in particular **log events you ingest** and any personal data in monitor configuration, incident text, or status‑page content — produktive acts as a **processor** on your behalf, and you are the controller. You are responsible for having a lawful basis for that data, for honouring data‑subject requests relating to it, and for setting appropriate retention. We do not currently offer a separate Data Processing Agreement (DPA); the processing terms in this Privacy Policy and our Terms apply. If you require a DPA for compliance reasons, contact support@produktive.app.

---

## 10. Security

- Passwords are hashed with **Argon2**; we never store plaintext passwords.
- Session and ingest tokens are stored only as hashes; raw tokens are shown to you once.
- Authentication endpoints are rate‑limited (login and registration), with optional Redis‑backed enforcement.
- Access to workspace data is gated by membership and role checks; some actions are restricted to workspace owners.
- Data is hosted with reputable EU infrastructure providers (see [Section 6](#6-where-your-data-is-stored-and-processed)).

No method of transmission or storage is completely secure, and we cannot guarantee absolute security. TODO(confirm): encryption‑at‑rest and TLS specifics you wish to state, and any breach‑notification commitments beyond the GDPR statutory requirements.

---

## 11. Your responsibilities and security recommendations

- Only monitor targets you own or are authorised to monitor (see the Terms).
- Avoid placing secrets directly in monitor targets, expected‑value fields, or DSL sources; prefer environment‑based lookups. Note that failed checks may store an error message that can contain response fragments.
- Avoid sending personal or sensitive data in ingested log events unless you have a lawful basis and an appropriate retention period configured.
- Treat ingest tokens, session tokens, and webhook URLs as secrets.

---

## 12. Cookies and local storage

produktive does **not** use advertising or analytics cookies. To run the app we store, in your browser's `localStorage`:

- `unstatus.token` — your authentication token, so you stay signed in.
- `unstatus.theme` — your light/dark theme preference.

These are strictly necessary for the app to function and remain on your device. Because we do not use non‑essential tracking technologies, no cookie‑consent banner is required for the application itself. TODO(confirm): whether any custom‑domain or third‑party embed introduces additional cookies.

---

## 13. Children

The Service is not directed to children and is intended for use by businesses and professionals. It is not available to anyone under 16, and we do not knowingly collect personal data from children under 16. If you believe a child has provided personal data, contact support@produktive.app and we will delete it.

---

## 14. Changes to this policy

We may update this policy from time to time. We will update the effective date above and, for material changes, take reasonable steps to notify account users. Continued use of the Service after changes take effect constitutes acceptance.

---

## 15. Contact

Questions or requests regarding this policy or your personal data:

**Email:** support@produktive.app
