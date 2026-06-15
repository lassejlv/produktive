import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BASE_URL,
  INGEST_TOKEN_HEADER,
  ProduktiveLogError,
  createEvlogSink,
  createLogClient,
  normalizeEvlogEvent,
} from "../src/index";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Produktive logs SDK", () => {
  test("defaults to the production base URL", async () => {
    let requestedUrl = "";
    const client = createLogClient({
      token: "plog_test",
      fetch: async (url) => {
        requestedUrl = String(url);
        return jsonResponse({ accepted: 1, project_id: "project" });
      },
    });

    await client.ingest({ level: "info", message: "hello" });

    expect(client.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(requestedUrl).toBe("https://produktive.app/api/logs/ingest");
  });

  test("sends the ingest token header and batch body", async () => {
    const captured: { request?: Request } = {};
    const client = createLogClient({
      token: "plog_secret",
      baseUrl: "https://produktive.app/",
      fetch: async (_url, init) => {
        captured.request = new Request(String(_url), init);
        return jsonResponse({ accepted: 2, project_id: "project" });
      },
    });

    const response = await client.ingest([
      { level: "info", message: "one" },
      { level: "warn", message: "two" },
    ]);

    expect(response.accepted).toBe(2);
    expect(captured.request?.headers.get(INGEST_TOKEN_HEADER)).toBe("plog_secret");
    expect(await captured.request?.json()).toEqual({
      events: [
        { level: "info", message: "one" },
        { level: "warn", message: "two" },
      ],
    });
  });

  test("serializes errors and dates", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const client = createLogClient({
      token: "plog_secret",
      fetch: async (_url, init) => {
        captured.body = (await new Request(String(_url), init).json()) as Record<string, unknown>;
        return jsonResponse({ accepted: 1, project_id: "project" });
      },
    });

    await client.ingest({
      level: "error",
      message: "failed",
      timestamp: new Date("2026-06-15T10:00:00.000Z"),
      error: new Error("boom"),
    });

    expect(captured.body?.timestamp).toBe("2026-06-15T10:00:00.000Z");
    expect(captured.body?.error).toMatchObject({ name: "Error", message: "boom" });
  });

  test("throws a typed error for failed ingest", async () => {
    const client = createLogClient({
      token: "plog_secret",
      fetch: async () => new Response("bad token", { status: 401 }),
    });

    await expect(client.ingest({ message: "hello" })).rejects.toBeInstanceOf(ProduktiveLogError);
  });

  test("normalizes evlog-style events", () => {
    expect(
      normalizeEvlogEvent(
        {
          msg: "checkout failed",
          severity: "error",
          error: new Error("declined"),
        },
        { service: "api" },
      ),
    ).toMatchObject({
      service: "api",
      msg: "checkout failed",
      severity: "error",
      error: { name: "Error", message: "declined" },
    });
  });

  test("creates an evlog sink", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const sink = createEvlogSink(
      {
        token: "plog_secret",
        fetch: async (_url, init) => {
          captured.body = (await new Request(String(_url), init).json()) as Record<
            string,
            unknown
          >;
          return jsonResponse({ accepted: 1, project_id: "project" });
        },
      },
      { service: "worker" },
    );

    await sink("started");

    expect(captured.body).toMatchObject({ service: "worker", level: "info", message: "started" });
  });
});
