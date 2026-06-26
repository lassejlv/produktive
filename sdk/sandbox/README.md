# @produktive/sandboxes

TypeScript SDK for Produktive sandboxes. Create isolated environments, run commands, manage checkpoints, and tear them down.

The default API base URL is `https://produktive.app`.

## Install

```sh
bun add @produktive/sandboxes
```

## Quick start

```ts
import { Sandbox } from "@produktive/sandboxes";

const sandbox = await Sandbox.create({
  token: process.env.PRODUKTIVE_SANDBOX_TOKEN!,
  name: "agent",
});

const { stdout, exitCode } = await sandbox.exec("echo hello");
console.log(stdout, exitCode);

await sandbox.destroy();
```

Create a `prd_sbx_…` token in **Deployments → Sandboxes → API tokens**.

## Configuration

| Option | Environment variable | Default |
| --- | --- | --- |
| `token` | `PRODUKTIVE_SANDBOX_TOKEN` | _(required)_ |
| `baseUrl` | — | `https://produktive.app` |
| `fetch` | — | `globalThis.fetch` |

```ts
const sandbox = await Sandbox.create({
  token: process.env.PRODUKTIVE_SANDBOX_TOKEN!,
  baseUrl: "https://produktive.app",
  name: "ci-runner",
  region: "iad",
  memoryMb: 1024,
});
```

## Sandboxes

Static helpers mirror the Railway sandboxes SDK shape:

- `Sandbox.create(options)` — provision a sandbox and wait until `RUNNING`
- `Sandbox.connect(id, options?)` — reattach to an existing sandbox
- `Sandbox.list(options?)` — list sandboxes in the workspace

Instance methods:

- `sandbox.exec(command, options?)` — run a command (`exitCode`, `stdout`, `stderr`, `timedOut`, `truncated`)
- `sandbox.destroy()` — delete the sandbox
- `sandbox.listCheckpoints()` / `createCheckpoint()` / `restoreCheckpoint()` / `deleteCheckpoint()`
- `sandbox.refresh()` — reload sandbox metadata

## Low-level client

```ts
import { createSandboxClient } from "@produktive/sandboxes";

const client = createSandboxClient({
  token: process.env.PRODUKTIVE_SANDBOX_TOKEN!,
});

const sandboxes = await client.list();
const created = await client.create({ name: "agent" });
const result = await client.exec(created.id, "pwd");
await client.destroy(created.id);
```

The SDK sends `Authorization: Bearer prd_sbx_…` to `/api/v1/sandboxes`.
