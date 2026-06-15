# Produktive Log Storage

This document explains how Produktive stores and searches logs without putting log events in the production Postgres database and without ClickHouse.

## Goals

- Keep durable log data out of production Postgres.
- Keep storage cheap by using S3-compatible object storage.
- Keep search flexible with DuckDB over Parquet files.
- Support multiple projects and multiple storage buckets.
- Use Redis/Upstash only as an optional hot cache, not as the source of truth.

## High-Level Shape

```mermaid
flowchart LR
  SDK["SDK / curl / evlog"] --> API["POST /api/logs/ingest"]
  API --> Token["Ingest token lookup"]
  Token --> Project["Log project metadata in Postgres"]
  Project --> Store["DuckDB append"]
  Store --> Parquet["Parquet files in S3/local storage"]
  API -. optional .-> Redis["LOG_REDIS_URL hot cache"]

  UI["Log explorer"] --> Search["GET project events"]
  Search -. recent .-> Redis
  Search --> DuckDB["DuckDB read_parquet"]
  DuckDB --> Parquet
```

Postgres stores metadata: workspaces, projects, ingest tokens, alert rules, bucket config, and usage rollups. It does not store the log event stream.

## Durable Storage

Durable logs are written as Parquet files. The storage backend can be:

- local filesystem for development
- S3-compatible object storage for production

The default local fallback is outside the repo:

```env
LOG_STORAGE_URI=/tmp/produktive-logs
```

Production should use admin-configured buckets, for example:

```text
s3://produktive-logs-eu/logs
```

The path layout is partitioned like this:

```text
<storage_uri>/
  workspace_id=<workspace_uuid>/
    project_id=<project_uuid>/
      day=YYYY-MM-DD/
        hour=HH/
          part_<uuid>.parquet
```

This keeps projects isolated and lets DuckDB read only the relevant project/time range.

## Bucket Assignment

Admins configure log storage buckets in the admin UI. Each bucket has:

- name
- storage URI
- optional region
- optional S3 endpoint
- access key ID
- secret access key
- project capacity
- enabled flag

When a new log project is created, the API chooses an enabled bucket that still has capacity. It picks the least-used available bucket.

If no admin buckets exist, the project falls back to `LOG_STORAGE_URI`.

## Ingest Flow

Clients send logs to:

```http
POST /api/logs/ingest
x-produktive-log-token: plog_...
content-type: application/json
```

The ingest token maps to one log project. The API:

1. Verifies the token.
2. Normalizes the payload into one or more log events.
3. Writes events to Parquet via DuckDB.
4. Updates usage rollups in Postgres.
5. Optionally writes recent events to Redis/Upstash hot cache.

Accepted payloads:

```json
{
  "level": "info",
  "message": "checkout started",
  "service": "api",
  "environment": "production"
}
```

or batches:

```json
{
  "events": [
    { "level": "info", "message": "one" },
    { "level": "error", "message": "two" }
  ]
}
```

The parser is strict JSON first, then JSON5 fallback. That means common curl mistakes like trailing commas are accepted.

Unknown fields are preserved in the stored event JSON and searchable later.

## Search Flow

The log explorer calls:

```http
GET /api/workspaces/:wid/logs/projects/:project/events
```

Supported filters:

- `from`
- `to`
- `q`
- `level`
- `service`
- `limit`

Search checks the optional Redis hot cache first when the query is fully inside the hot window. If Redis cannot answer, or if Redis is disabled, the API falls back to DuckDB over Parquet.

DuckDB reads files with `read_parquet(...)` and applies:

- timestamp range
- level filter
- service filter
- text search over message/event/fields JSON
- descending timestamp order
- limit

## Redis / Upstash Hot Cache

Redis is optional and should be separate from the app Redis used for auth/rate limits.

Use:

```env
REDIS_URL=...          # app/rate limits
LOG_REDIS_URL=...      # logs only
```

For Upstash, use the Redis protocol URL:

```env
LOG_REDIS_URL=rediss://default:xxx@your-upstash-host:6379
LOG_REDIS_TTL_SECONDS=1800
LOG_SEARCH_CACHE_TTL_SECONDS=15
LOG_REDIS_SEARCH_SCAN_LIMIT=5000
```

Redis stores recent events in a sorted set per project:

```text
produktive:logs:hot:<workspace_id>:<project_id>
```

The score is the event timestamp in milliseconds. Entries expire with a strict TTL.

Short historical search results can also be cached:

```text
produktive:logs:search:<workspace_id>:<project_id>:<hash>
```

Recent/live searches are not result-cached, so the log explorer does not go stale.

Redis is an acceleration layer only. If Redis is down, ingest and search still work through Parquet/DuckDB.

## Alerts

Log alert rules use the same search path:

1. Try Redis hot cache for recent windows.
2. Fall back to DuckDB/S3 if Redis misses or fails.

This makes common alert windows cheap while preserving correctness through durable storage.

## Project Deletion

When a log project is deleted:

1. The API deletes that project's object-storage prefix.
2. Then it deletes the Postgres project row.

For S3, the deleted prefix is:

```text
<bucket-prefix>/workspace_id=<workspace_id>/project_id=<project_id>/
```

If storage cleanup fails, the project delete fails. This avoids orphaning log data while pretending the project is gone.

## Important Environment Variables

```env
# Durable fallback storage when no admin bucket is assigned.
LOG_STORAGE_URI=/tmp/produktive-logs

# Optional DuckDB file path. Empty means in-memory DuckDB connection.
LOG_DUCKDB_PATH=

# Ingest limits.
LOG_INGEST_MAX_BATCH_EVENTS=1000
LOG_INGEST_MAX_BODY_BYTES=1048576

# Alert sweep interval.
LOG_ALERT_TICK_SECONDS=60

# Dedicated log hot cache. Do not reuse REDIS_URL.
LOG_REDIS_URL=
LOG_REDIS_TTL_SECONDS=1800
LOG_SEARCH_CACHE_TTL_SECONDS=15
LOG_REDIS_SEARCH_SCAN_LIMIT=5000

# Optional default S3 settings. Per-bucket admin settings override these.
LOG_S3_REGION=
LOG_S3_ENDPOINT=
LOG_S3_ACCESS_KEY_ID=
LOG_S3_SECRET_ACCESS_KEY=
```

## Why This Storage Approach

This gives us cheap durable storage and flexible search without running a dedicated log database.

The tradeoff is that DuckDB/S3 search can get slow if we create too many tiny Parquet files. The next scaling step should be a compactor that merges many small files into larger hourly files.

Recommended future improvements:

- write object metadata manifests for faster file selection
- compact small Parquet files by project/hour
- keep Redis hot windows short and TTL-bound
- keep `LOG_REDIS_URL` isolated from app rate-limit Redis
