# Terms of Service

**Effective date:** 2026-06-15

These Terms of Service ("Terms") govern your access to and use of the **produktive** uptime‑monitoring and status‑page service at **https://produktive.app** and related subdomains (the "Service"), operated by produktive ("produktive", "we", "us", or "our"), a **sole proprietorship (enkeltmandsvirksomhed) established in Denmark**. You can contact us at support@produktive.app.

By creating an account or using the Service, you agree to these Terms. If you are using the Service on behalf of an organisation, you represent that you have authority to bind that organisation.

---

## 1. The Service

produktive lets you create **monitors** that periodically probe targets you specify — over HTTP, TCP, ICMP (ping), PostgreSQL, Redis, or SSH — from one or more regions, records the results, and presents availability and latency over time. You can organise monitors into **workspaces**, publish **public status pages** (optionally on your own custom domain), declare **incidents**, configure **notifications** (e.g. webhook/Slack/Discord), and optionally ingest and query **logs**.

Some features are subject to your subscription plan (see [Section 6](#6-plans-billing-and-payments)).

---

## 2. Accounts

- You must provide a valid email address and choose a password (minimum 8 characters), or sign in with GitHub.
- You are responsible for safeguarding your credentials and for all activity under your account.
- You must be at least 16 years old and capable of forming a binding contract.
- Each account is created with a personal workspace. You may create additional workspaces and invite members.

---

## 3. Workspaces, members, and roles

- A workspace has an **owner** and may have additional **members**. Roles are **owner** and **member**.
- **Owners** can manage billing, members, invitations, custom domains, and delete the workspace. Some actions are restricted to owners.
- Invitations are sent by email and expire after **7 days**.
- The workspace owner is responsible for the conduct of the workspace's members and for the content and configuration within the workspace.

---

## 4. Acceptable use

The Service makes **outbound network probes to targets you configure**. This capability carries real responsibilities. You agree that you will **not**:

- Monitor or probe any host, network, service, or endpoint that you do not own or are not clearly authorised to monitor.
- Use the Service for port scanning, network reconnaissance, vulnerability scanning, or any form of unauthorised access against third‑party systems.
- Configure check intervals, regions, or monitor volumes in a way intended to cause, or that has the effect of, denial‑of‑service, flooding, or excessive load on a target.
- Use the Service to transmit malware, to attempt to gain unauthorised access to any system, or to circumvent any security or authentication mechanism.
- Publish on a status page, or store in monitor/incident/log content, any material that is unlawful, infringing, defamatory, or that violates the privacy or rights of others.
- Ingest log data, or store personal data, without a lawful basis to do so.
- Resell, sublicense, or provide the Service to third parties except as members of your workspace, or use it to build a competing service.
- Interfere with, overload, or attempt to disrupt the Service or its infrastructure, or exceed or evade plan limits or rate limits.

We may suspend or terminate access, remove content, or disable monitors that we reasonably believe violate these Terms or applicable law, or that threaten the integrity, security, or lawful operation of the Service or third‑party systems.

---

## 5. Your content and data

- **Your content** — monitor configurations, DSL sources, incident text, status‑page configuration, notification settings, and ingested log data — remains yours. You grant us the limited licence necessary to host, process, transmit, and display it solely to provide the Service.
- You are responsible for the legality of your content and for having the rights and authorisations needed to monitor your targets and to store the data you submit.
- **Public status pages are publicly accessible without authentication.** Do not place confidential or personal information on them unless you intend it to be public.
- We process personal data as described in our [Privacy Policy](./PRIVACY.md). For data you ingest about third parties, you are the controller and we act as your processor.

---

## 6. Plans, billing, and payments

- The Service may be offered on a free tier and on paid subscription plans. Plan limits apply to items such as the number of monitors, members, included check volume, minimum check interval, multi‑region checks, and custom domains.
- Payments and subscriptions are handled by our payment processor **Polar** (polar.sh). By subscribing, you also agree to Polar's applicable terms. We do not store full payment‑card details.
- **Pricing model:** paid plans consist of a **monthly base price that includes an allowance of usage** (such as check volume), plus **usage‑based overage charges** for consumption above the included allowance. Charges may also reflect the monthly peak number of monitors and members in your workspace. Current prices, included allowances, overage rates, currency, and taxes are shown in the Service, at checkout, or by Polar before you subscribe.
- **Renewal and cancellation:** subscriptions renew automatically each billing period unless cancelled. You may cancel at any time; cancellation takes effect at the end of the current billing period, and you retain paid features until then.
- **Refunds:** except where required by applicable law or expressly stated at checkout, fees already paid are non‑refundable and cancellation does not automatically create a pro‑rated refund. EU consumers retain any mandatory statutory withdrawal rights.
- **Plan limit enforcement:** if you exceed plan limits, we may prevent the creation of additional resources or pause monitors. If our billing provider is temporarily unreachable, the Service may continue to operate ("fail open") and reconcile usage later.
- If billing is not enabled for your deployment, plan limits do not apply.

---

## 7. Third‑party services

The Service integrates with third parties including Polar (billing), optional GitHub sign‑in, an email provider for transactional messages, and the notification destinations you configure (e.g. Slack, Discord, or your own webhooks). Your use of those services is subject to their own terms, and we are not responsible for third‑party services or for content delivered to destinations you configure.

---

## 8. Custom domains

If you connect a custom domain to a status page, you must control that domain and complete DNS verification. You authorise us (and our reverse‑proxy provider) to obtain and serve TLS certificates for it. You are responsible for maintaining the required DNS records.

---

## 9. Availability and support

- We aim to keep the Service available but do **not** guarantee uninterrupted or error‑free operation. The Service may be unavailable for maintenance, updates, or factors outside our control.
- **We provide no service‑level agreement (SLA) or uptime guarantee.** Support is provided on a best‑effort basis by email at support@produktive.app.
- Status data and monitoring results are provided for informational purposes and should not be your sole basis for safety‑ or compliance‑critical decisions.

---

## 10. Intellectual property

The Service, including its software, design, and trademarks, is owned by produktive and its licensors and is protected by intellectual‑property laws. These Terms grant you a limited, non‑exclusive, non‑transferable right to use the Service; no other rights are granted. Open‑source components included in or made available with the Service remain subject to their applicable open‑source licences.

---

## 11. Termination

- You may stop using the Service and delete your workspace(s) at any time. To delete your account, contact support@produktive.app.
- We may suspend or terminate your access for breach of these Terms, non‑payment, or where required by law, with notice where reasonably practicable.
- On termination, your right to use the Service ends. We may delete your content after termination, subject to retention described in the Privacy Policy and any legal obligations.

---

## 12. Disclaimers

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON‑INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW. We do not warrant that monitoring results, alerts, or notifications will be accurate, timely, or delivered.

Nothing in these Terms excludes or limits liability that cannot be excluded or limited under applicable mandatory law, including statutory rights of consumers.

---

## 13. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, produktive will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising out of or relating to the Service. Our total aggregate liability for any and all claims relating to the Service will not exceed **EUR 100**.

This limitation does not apply to liability for gross negligence or wilful misconduct, or to any liability that cannot be limited under applicable mandatory law.

---

## 14. Indemnification

To the extent permitted by law, you agree to indemnify and hold produktive harmless from claims, damages, and reasonable expenses arising from your content, your use of the Service, your monitoring of targets you were not authorised to monitor, or your breach of these Terms. If you are a consumer, this section applies only to the extent permitted by mandatory consumer‑protection law.

---

## 15. Changes to the Service and to these Terms

We may modify the Service and these Terms from time to time. For material changes to these Terms, we will update the effective date and take reasonable steps to notify account users. Continued use after changes take effect constitutes acceptance. If you do not agree, you must stop using the Service.

---

## 16. Governing law and disputes

These Terms are governed by the laws of **Denmark**, without regard to conflict‑of‑laws rules, and disputes are subject to the jurisdiction of the competent courts of Denmark. If you are a consumer in the EU, you retain the protection of mandatory provisions of the law of your country of residence, and you may have access to your local courts.

---

## 17. Miscellaneous

- If any provision is found unenforceable, the remaining provisions remain in effect.
- These Terms, together with the Privacy Policy, are the entire agreement between you and produktive regarding the Service.
- You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or sale of assets.
- Our failure to enforce a provision is not a waiver.

---

## 18. Contact

**Email:** support@produktive.app
**Provider:** produktive — a sole proprietorship in Denmark
