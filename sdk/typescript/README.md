# Produktive Logs SDK

TypeScript SDK for ingesting logs into Produktive.

The default API base URL is `https://produktive.app`.

## Install

```sh
bun add @produktive/logs
```

## Basic Usage

```ts
import { createLogger } from "@produktive/logs";

const logger = createLogger(
  {
    token: process.env.PRODUKTIVE_LOG_TOKEN!,
  },
  {
    service: "api",
    environment: "production",
  },
);

await logger.info("checkout started", {
  request_id: "req_123",
  cart_id: "cart_123",
});

await logger.error("checkout failed", {
  error: new Error("payment declined"),
  request_id: "req_123",
});
```

## Direct Ingest

```ts
import { createLogClient } from "@produktive/logs";

const logs = createLogClient({
  token: process.env.PRODUKTIVE_LOG_TOKEN!,
});

await logs.ingest({
  level: "info",
  message: "server started",
  service: "api",
  environment: "production",
});

await logs.ingest([
  { level: "info", message: "one" },
  { level: "warn", message: "two" },
]);
```

## Custom Base URL

```ts
const logs = createLogClient({
  token: process.env.PRODUKTIVE_LOG_TOKEN!,
  baseUrl: "https://produktive.app",
});
```

## evlog

`createEvlogSink` accepts strings, errors, or arbitrary structured event objects.

```ts
import { createEvlogSink } from "@produktive/logs";

const sink = createEvlogSink(
  {
    token: process.env.PRODUKTIVE_LOG_TOKEN!,
  },
  {
    service: "api",
    environment: "production",
  },
);

await sink({
  severity: "error",
  msg: "checkout failed",
  route: "/checkout",
  error: new Error("payment declined"),
});
```

If your evlog setup supports sinks/transports, pass the returned function as the sink handler.

## API

- `createLogClient(options)` creates a low-level client.
- `client.ingest(event | event[])` sends one event or a batch.
- `client.logger(defaults)` creates a structured logger.
- `createLogger(options, defaults)` creates a logger directly.
- `createEvlogSink(clientOrOptions, defaults)` creates an evlog-friendly async sink.

The SDK sends `x-produktive-log-token` to `POST /api/logs/ingest`.
