# produktive-logs

Rust SDK for ingesting logs into Produktive — the counterpart to the TypeScript
SDK (`@produktive/logs`).

The default base URL is `https://produktive.app`. The ingest token is sent in the
`x-produktive-log-token` header to `POST /api/logs/ingest`.

## Basic usage

```rust
use produktive_logs::{create_logger, LogClientBuilder, LogEvent};

let logger = create_logger(
    LogClientBuilder::default().token(std::env::var("PRODUKTIVE_LOG_TOKEN")?),
    LogEvent::new().service("api").environment("production"),
)?;

logger
    .info("checkout started", LogEvent::new().field("request_id", "req_123"))
    .await?;

logger
    .error(
        "checkout failed",
        LogEvent::new().error(&err).field("request_id", "req_123"),
    )
    .await?;
```

## Direct ingest

```rust
use produktive_logs::{LogClient, LogEvent};

let logs = LogClient::new(std::env::var("PRODUKTIVE_LOG_TOKEN")?)?;
// or: LogClient::from_env()? (reads PRODUKTIVE_LOG_TOKEN + PRODUKTIVE_LOG_BASE_URL)

logs.ingest(
    LogEvent::new()
        .level("info")
        .message("server started")
        .service("api")
        .environment("production"),
)
.await?;

logs.ingest_batch(vec![
    LogEvent::new().level("info").message("one"),
    LogEvent::new().level("warn").message("two"),
])
.await?;
```

## Custom base URL

```rust
let logs = LogClient::builder()
    .token(token)
    .base_url("https://produktive.app")
    .build()?;
```

## evlog

`EvlogSink` accepts strings or arbitrary structured events.

```rust
use produktive_logs::{create_evlog_sink, LogClientBuilder, LogEvent};

let sink = create_evlog_sink(
    LogClientBuilder::default().token(token),
    LogEvent::new().service("api").environment("production"),
)?;

sink.send(
    LogEvent::new()
        .severity("error")
        .field("msg", "checkout failed")
        .field("route", "/checkout")
        .error(&err),
)
.await?;
```

## API

- `LogClient::new(token)` / `LogClient::builder()` / `LogClient::from_env()` — low-level client.
- `client.ingest(event)` / `client.ingest_batch(events)` — send one event or a batch.
- `client.logger(defaults)` — structured logger with per-level helpers.
- `create_logger(builder, defaults)` — build a logger directly.
- `create_evlog_sink(builder, defaults)` — build an evlog-friendly async sink.
- `normalize_evlog_event(event, defaults)` — the normalization used by the sink.
