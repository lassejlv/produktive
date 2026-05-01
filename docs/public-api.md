# Produktive Public API

Base URL:

```text
https://produktive.app/api/v1
```

Use a workspace API key from workspace settings:

```sh
curl https://produktive.app/api/v1/issues \
  -H "Authorization: Bearer pk_api_..."
```

These keys are for the public REST API only. Produktive MCP uses OAuth at `https://mcp.produktive.app/mcp`.
Only workspace owners can create, list, or revoke workspace API keys.

Runtime key validity is checked through Unkey first. If Unkey cannot verify a key, Produktive returns `401` instead of falling back to the local key hash mirror.

## Legacy Key Import

Active, unexpired legacy key hashes can be imported into Unkey once:

```sh
UNKEY_MIGRATION_ID="mig_..." cargo run -p produktive-api --bin migrate_unkey_keys
```

The command skips rows that already have an Unkey key id, imports local SHA-256 hex hashes with the `pk_api` or legacy `pk_mcp` prefix, writes returned Unkey key ids back to `mcp_api_keys`, and exits non-zero if any key fails to import. Revoked or expired keys are left as local history.

## Errors

Errors use the same JSON shape across endpoints:

```json
{ "error": "Unauthorized" }
```

Common statuses:

- `401` for missing, invalid, revoked, or expired API keys.
- `403` when the key is not pinned to a workspace or no longer belongs to a workspace member.
- `404` when a resource does not exist in the key's workspace.
- `409` for uniqueness conflicts such as duplicate active label names.

## Issues

```sh
curl https://produktive.app/api/v1/issues \
  -H "Authorization: Bearer pk_api_..."
```

Endpoints:

- `GET /issues`
- `POST /issues`
- `GET /issues/{id}`
- `PATCH /issues/{id}`
- `DELETE /issues/{id}`

List query parameters:

- `status`
- `priority`
- `assignedToId`
- `projectId`
- `labelId`
- `labelIds` as a comma-separated list
- `limit` from `1` to `100`

Create body:

```json
{
  "title": "Write importer",
  "description": "Sync repository issues",
  "status": "backlog",
  "priority": "medium",
  "assignedToId": "user_id",
  "parentId": "issue_id",
  "projectId": "project_id",
  "labelIds": ["label_id"]
}
```

Patch accepts the same fields. Empty `assignedToId`, `parentId`, or `projectId` clears the field.

## Labels

Endpoints:

- `GET /labels`
- `POST /labels`
- `GET /labels/{id}`
- `PATCH /labels/{id}`
- `DELETE /labels/{id}`

List query parameters:

- `includeArchived=true`

Create body:

```json
{
  "name": "Bug",
  "description": "Something broken",
  "color": "red"
}
```

Patch accepts `name`, `description`, `color`, and `archived`.

## Projects

Endpoints:

- `GET /projects`
- `POST /projects`
- `GET /projects/{id}`
- `PATCH /projects/{id}`
- `DELETE /projects/{id}`

List query parameters:

- `includeArchived=true`

Create body:

```json
{
  "name": "API launch",
  "description": "Public API v1",
  "status": "planned",
  "color": "blue",
  "icon": "terminal",
  "leadId": "user_id",
  "targetDate": "2026-06-01"
}
```

Patch accepts the same fields plus `archived`.
