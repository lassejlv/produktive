import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BASE_URL,
  ProduktiveSandboxAuthError,
  ProduktiveSandboxError,
  Sandbox,
  createSandboxClient,
  isRunning,
  waitForRunning,
} from "../src/index";

const sandboxRecord = {
  id: "0192f1d0-0000-7000-8000-000000000001",
  name: "agent",
  slug: "agent",
  status: "COLD",
  region: "iad",
  cpus: 1,
  memoryMb: 512,
  storageGb: 5,
  url: null,
  createdAt: "2026-06-26T12:00:00+00:00",
  updatedAt: "2026-06-26T12:00:00+00:00",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("@produktive/sandboxes", () => {
  test("requires a sandbox API token", () => {
    expect(() => createSandboxClient()).toThrow(ProduktiveSandboxAuthError);
  });

  test("defaults to the production base URL", async () => {
    let requestedUrl = "";
    const client = createSandboxClient({
      token: "prd_sbx_test",
      fetch: async (url) => {
        requestedUrl = String(url);
        return jsonResponse([]);
      },
    });

    await client.list();

    expect(client.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(requestedUrl).toBe("https://produktive.app/api/v1/sandboxes");
  });

  test("sends bearer auth and camelCase create body", async () => {
    const captured: { request?: Request } = {};
    const client = createSandboxClient({
      token: "prd_sbx_secret",
      baseUrl: "https://produktive.app/",
      fetch: async (_url, init) => {
        captured.request = new Request(String(_url), init);
        return jsonResponse({ ...sandboxRecord, status: "RUNNING" });
      },
    });

    const created = await client.create({
      name: "agent",
      memoryMb: 1024,
      region: "iad",
    });

    expect(created.name).toBe("agent");
    expect(captured.request?.headers.get("authorization")).toBe("Bearer prd_sbx_secret");
    expect(await captured.request?.json()).toEqual({
      name: "agent",
      memoryMb: 1024,
      region: "iad",
    });
  });

  test("exec posts command payload", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const client = createSandboxClient({
      token: "prd_sbx_secret",
      fetch: async (_url, init) => {
        captured.body = (await new Request(String(_url), init).json()) as Record<string, unknown>;
        return jsonResponse({
          exitCode: 0,
          stdout: "hello\n",
          stderr: "",
          timedOut: false,
          truncated: false,
        });
      },
    });

    const result = await client.exec(sandboxRecord.id, "echo", { args: ["hello"] });

    expect(result.stdout).toBe("hello\n");
    expect(captured.body).toEqual({
      command: "echo",
      args: ["hello"],
      cwd: undefined,
      timeoutSec: undefined,
    });
  });

  test("throws a typed error for failed requests", async () => {
    const client = createSandboxClient({
      token: "prd_sbx_secret",
      fetch: async () => new Response("unauthorized", { status: 401 }),
    });

    await expect(client.list()).rejects.toBeInstanceOf(ProduktiveSandboxError);
  });

  test("Sandbox.create waits until RUNNING", async () => {
    let polls = 0;
    const sandbox = await Sandbox.create({
      token: "prd_sbx_secret",
      name: "agent",
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      fetch: async (_url, init) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return jsonResponse(sandboxRecord);
        }
        polls += 1;
        return jsonResponse({
          ...sandboxRecord,
          status: polls >= 2 ? "RUNNING" : "STARTING",
        });
      },
    });

    expect(sandbox.status).toBe("RUNNING");
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  test("waitForRunning resolves on RUNNING status", async () => {
    let polls = 0;
    const client = createSandboxClient({
      token: "prd_sbx_secret",
      fetch: async () => {
        polls += 1;
        return jsonResponse({
          ...sandboxRecord,
          status: polls >= 2 ? "RUNNING" : "COLD",
        });
      },
    });

    const record = await waitForRunning(client, sandboxRecord.id, { pollIntervalMs: 1 });
    expect(record.status).toBe("RUNNING");
    expect(isRunning("RUNNING")).toBe(true);
  });

  test("Sandbox.connect loads an existing sandbox", async () => {
    const sandbox = await Sandbox.connect(sandboxRecord.id, {
      token: "prd_sbx_secret",
      fetch: async () => jsonResponse({ ...sandboxRecord, status: "RUNNING" }),
    });

    expect(sandbox.id).toBe(sandboxRecord.id);
    expect(sandbox.status).toBe("RUNNING");
  });
});
