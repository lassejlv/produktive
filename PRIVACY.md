# Produktive Privacy Policy

Effective date: April 29, 2026

This Privacy Policy explains how Produktive collects, uses, stores, and shares personal data when you use Produktive, a productivity workspace for issues, projects, team chat, AI-assisted workflows, file attachments, and workspace integrations.

The Service is operated by Lasse Vestergaard, Aalborg, Denmark ("Produktive", "we", "us", or "our"). Contact us at support@produktive.app.

This is a practical privacy-policy draft and should be reviewed by counsel before production use.

## 1. Scope

This Policy applies to Produktive's website, web application, API, authentication flows, workspace features, AI features, uploaded attachments, and connected integrations.

This Policy does not cover third-party services that you access separately or connect to Produktive, such as remote MCP servers, AI providers, or other external tools. Their own privacy policies apply to their processing.

## 2. Controller

For personal data that Produktive determines how and why to process, the controller is:

Produktive  
Lasse Vestergaard  
Aalborg, Denmark  
support@produktive.app

For personal data placed in a workspace by your organization, your organization may also act as a controller. Produktive may act as a processor for workspace content depending on the relationship and applicable law.

## 3. Personal Data We Collect

We collect the following categories of personal data, depending on how you use Produktive:

- Account data: name, email address, user ID, email verification status, password hash, profile image if added, account timestamps.
- Authentication data: session ID, active workspace ID, session expiry, revoked session timestamps, verification and password reset token hashes.
- Workspace data: workspace name, slug, members, roles, invitations, invited email addresses, invitation status, and workspace settings.
- Productivity content: issues, descriptions, comments, labels, projects, priorities, assignments, status history, subscribers, favorites, inbox notifications, and activity events.
- Chat and AI content: chat titles, chat messages, prompts, responses, tool-call arguments and results, AI model selection, referenced issues or chats, and remote MCP tool context.
- Attachments: uploaded file names, content types, sizes, object keys, URLs, and file contents stored in object storage.
- Integration data: MCP server names, URLs, slugs, connection status, cached tool metadata, OAuth state, access token ciphertext, refresh token ciphertext, client registration data, scopes, and expiry timestamps.
- Email data: email addresses, names, invitation emails, verification emails, password reset emails, and notification email content sent through Resend.
- Device and request data: IP address, browser and device metadata, request metadata, server logs, error/debug information, and security events that may be processed by our deployment and infrastructure providers.
- Local browser data: session cookies and local storage preferences such as theme, selected AI model, issue view preferences, collapsed UI groups, dismissed prompts, and similar settings.

We do not intentionally collect payment card numbers, government IDs, protected health information, or other regulated sensitive data. Please do not submit sensitive data unless we have expressly agreed in writing that the Service is appropriate for that data.

## 4. Sources of Personal Data

We collect personal data from:

- you, when you create an account, use the Service, upload files, write prompts, create workspace content, configure integrations, or contact us;
- workspace owners or members, when they invite you, assign work to you, mention you, or add you to a workspace;
- third-party providers, such as Resend email delivery events if enabled, AI providers, and connected MCP servers;
- automatic technical sources, such as cookies, local storage, logs, request metadata, and infrastructure events.

## 5. How We Use Personal Data

We use personal data to:

- provide, operate, secure, and maintain Produktive;
- create accounts, authenticate users, verify emails, reset passwords, and manage sessions;
- create and manage workspaces, members, invitations, roles, issues, projects, labels, comments, chats, notifications, and files;
- provide AI-assisted chat and workflow features;
- connect and operate MCP integrations at the direction of workspace owners;
- send transactional emails, such as verification, reset, invitation, assignment, and comment notifications;
- enforce workspace permissions;
- troubleshoot, debug, prevent abuse, detect security incidents, and protect the Service;
- comply with legal obligations and enforce our Terms;
- communicate with you about support, service notices, and policy updates.

## 6. Legal Bases for Processing

Where GDPR or similar law applies, our legal bases include:

- Contract: to provide the Service, accounts, workspaces, support, and requested features.
- Legitimate interests: to secure the Service, prevent abuse, debug issues, improve reliability, communicate with users, and maintain business records.
- Consent: where you choose optional features, connect integrations, enable browser preferences, or where consent is legally required.
- Legal obligation: to maintain tax, accounting, fraud-prevention, legal, and compliance records.

You may withdraw consent where processing is based on consent, but this will not affect processing that happened before withdrawal.

## 7. AI Processing

When you use AI features, Produktive may send prompts, chat history, workspace context, tool-call context, selected model IDs, and attachment URLs or metadata to the configured AI provider.

The current production AI provider is OpenCode Go. OpenCode Go documentation says its API endpoints provide access to supported models and that providers follow a zero-retention policy and do not use user data for model training. Because model and provider behavior can change, you should avoid submitting sensitive data to AI features unless you have confirmed that the current configuration is appropriate for your use case.

AI output is stored in Produktive chat history unless you delete the relevant chat or workspace, subject to backup and provider retention described in this Policy.

## 8. Cookies and Local Storage

Produktive uses an HTTP-only session cookie for authentication. The cookie is configured with SameSite=Lax and a configurable secure flag. The default session duration in the application configuration is 30 days.

Produktive also uses browser local storage for product preferences, including theme selection, selected AI model, issue view preferences, collapsed groups, and dismissed UI notices.

We did not find analytics or advertising scripts in the current repository.

You can control cookies and local storage through your browser settings, but disabling them may break login or product preferences.

## 9. Providers and Subprocessors

We use third-party providers to operate Produktive. These providers may process personal data as processors, subprocessors, independent controllers, or service providers depending on the service and context.

Current providers include:

- Unkey: API key infrastructure and operational observability.
- PlanetScale: hosted production database for application data.
- Cloudflare R2: object storage and delivery for uploaded issue and chat attachments.
- Resend: transactional email delivery for verification, reset, invitation, assignment, and comment emails.
- OpenCode Go and its model providers: AI model access for prompts, responses, and tool-call context.
- Connected MCP servers: external tools that workspace owners connect, such as Context7, Notra, PlanetScale MCP, or any custom MCP server.

Provider notes from current official documentation:

- PlanetScale states that database connections use TLS and that data locality depends on the database region and any replicas selected.
- Cloudflare R2 is object storage for unstructured data and supports public buckets, bucket-scoped tokens, and location controls.
- Resend's documentation describes email sending that includes recipient addresses, sender, subject, HTML/text body, and related email metadata.
- OpenCode Go documentation states that models may be hosted in the US, EU, and Singapore and that providers follow zero-retention/no-training policies.

## 10. International Transfers

Produktive is operated from Denmark and uses providers that may process data in the EU, United States, Singapore, or other locations depending on configuration and provider infrastructure.

Where required, we rely on appropriate safeguards such as Data Processing Addenda, Standard Contractual Clauses, Data Privacy Framework participation, regional hosting options, or other legally recognized transfer mechanisms offered by our providers.

## 11. Retention

We retain personal data for as long as needed to provide Produktive, comply with law, resolve disputes, enforce agreements, and maintain security.

Application data is generally retained while your account or workspace remains active:

- Account data remains until account deletion or as needed for legal/security records.
- Workspace content remains until deleted by users, workspace owners, or account/workspace deletion flows.
- Chat and AI history remains until the related chat or workspace is deleted.
- Uploaded attachments remain while the related issue, chat, or workspace uses them, subject to object-storage deletion behavior.
- Pending invitation records expire after 7 days in the application logic, though the record may remain with accepted, revoked, or expired status until cleanup or workspace deletion.
- Auth tokens for email verification expire after 24 hours; password reset tokens expire after 1 hour.
- Session cookies and server sessions default to 30 days unless revoked or changed in configuration.
## 12. Deletion and Export

You can delete your account from personal account settings. Workspace owners can delete workspaces from workspace settings. Users can delete chats, issues, projects, labels, MCP server records, and other items where the product provides deletion controls.

Database relationships currently cascade many workspace records on workspace deletion and remove or null certain user references on account deletion. Some content in a shared workspace may remain when a user account is deleted if the workspace itself remains.

To request access, correction, deletion, portability, restriction, or objection, contact support@produktive.app. We may need to verify your identity and workspace authority before acting on a request.

## 13. Your Privacy Rights

Depending on where you live, you may have rights to:

- access personal data we hold about you;
- correct inaccurate personal data;
- delete personal data;
- restrict or object to processing;
- receive a portable copy of personal data;
- withdraw consent where processing is based on consent;
- object to direct marketing;
- lodge a complaint with a data protection authority.

If you are in the EU or EEA, you may contact your local supervisory authority. In Denmark, the relevant authority is Datatilsynet.

To exercise rights, contact support@produktive.app.

## 14. Security

We use reasonable technical and organizational measures to protect personal data. Current application controls include:

- password hashing with Argon2;
- hashed verification and password reset tokens;
- HTTP-only session cookies;
- JWT-backed session validation;
- owner-only controls for MCP settings;
- encrypted storage of MCP OAuth access and refresh tokens;
- access checks scoped to the active workspace;
- provider security controls for database, object storage, email, deployment, and AI services.

No system is perfectly secure. You are responsible for using strong credentials, limiting workspace access, and connecting only trusted MCP servers and tools.

## 15. Children

Produktive is not intended for children under 15. We do not knowingly collect personal data from anyone under 15. If you believe a child under 15 has provided personal data to Produktive, contact support@produktive.app and we will take appropriate steps to delete it.

## 16. Marketing

The current repository evidence shows transactional emails for verification, password reset, invitations, assignments, and comments. It does not show marketing email flows.

## 17. Automated Decision-Making

Produktive uses AI features to assist with chat and issue workflows, but users remain responsible for reviewing output and deciding how to use it. We do not currently use personal data for legally significant automated decisions.

## 18. Changes to This Policy

We may update this Policy from time to time. If changes are material, we will provide reasonable notice, such as by posting in the Service or sending an email. The updated Policy will apply from its effective date.

## 19. Contact

Questions or requests about this Policy can be sent to:

Produktive  
Lasse Vestergaard  
Aalborg, Denmark  
support@produktive.app
