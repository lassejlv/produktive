export const DEFAULT_BASE_URL = "https://produktive.app";
export const INGEST_TOKEN_HEADER = "x-produktive-log-token";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "warning" | "error" | "fatal";
export type ProduktiveFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface LogEvent extends Record<string, unknown> {
  level?: LogLevel | string;
  severity?: LogLevel | string;
  message?: string;
  msg?: string;
  service?: string;
  service_name?: string;
  environment?: string;
  env?: string;
  operation?: string;
  op?: string;
  route?: string;
  path?: string;
  request_id?: string;
  requestId?: string;
  trace_id?: string;
  traceId?: string;
  timestamp?: string | number | Date;
  time?: string | number | Date;
  ts?: string | number | Date;
  source?: string;
  event?: Record<string, unknown>;
  error?: unknown;
}

export interface IngestResponse {
  accepted: number;
  project_id: string;
}

export interface ProduktiveLogClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: ProduktiveFetch;
  headers?: HeadersInit;
}

export interface LoggerDefaults extends Record<string, unknown> {
  service?: string;
  environment?: string;
  source?: string;
}

export interface LogOptions extends Record<string, unknown> {
  error?: unknown;
}

export type EvlogSink = (event: unknown) => Promise<IngestResponse>;

export class ProduktiveLogError extends Error {
  readonly status: number;
  readonly responseText: string;

  constructor(status: number, responseText: string) {
    super(`Produktive log ingest failed with status ${status}`);
    this.name = "ProduktiveLogError";
    this.status = status;
    this.responseText = responseText;
  }
}

export class ProduktiveLogClient {
  readonly baseUrl: string;

  #token: string;
  #fetch: ProduktiveFetch;
  #headers?: HeadersInit;

  constructor(options: ProduktiveLogClientOptions) {
    if (!options.token.trim()) {
      throw new Error("Produktive log token is required");
    }
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#token = options.token;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#headers = options.headers;
    if (!this.#fetch) {
      throw new Error("No fetch implementation available");
    }
  }

  async ingest(event: LogEvent | LogEvent[]): Promise<IngestResponse> {
    const body = Array.isArray(event)
      ? { events: event.map(serializeEvent) }
      : serializeEvent(event);
    const response = await this.#fetch(`${this.baseUrl}/api/logs/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INGEST_TOKEN_HEADER]: this.#token,
        ...this.#headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ProduktiveLogError(response.status, await response.text());
    }

    return response.json() as Promise<IngestResponse>;
  }

  logger(defaults: LoggerDefaults = {}): ProduktiveLogger {
    return new ProduktiveLogger(this, defaults);
  }
}

export class ProduktiveLogger {
  #client: ProduktiveLogClient;
  #defaults: LoggerDefaults;

  constructor(client: ProduktiveLogClient, defaults: LoggerDefaults = {}) {
    this.#client = client;
    this.#defaults = defaults;
  }

  log(level: LogLevel | string, message: string, fields: LogOptions = {}) {
    return this.#client.ingest({
      ...this.#defaults,
      ...fields,
      level,
      message,
      timestamp: new Date(),
    });
  }

  trace(message: string, fields?: LogOptions) {
    return this.log("trace", message, fields);
  }

  debug(message: string, fields?: LogOptions) {
    return this.log("debug", message, fields);
  }

  info(message: string, fields?: LogOptions) {
    return this.log("info", message, fields);
  }

  warn(message: string, fields?: LogOptions) {
    return this.log("warn", message, fields);
  }

  error(message: string, fields: LogOptions = {}) {
    return this.log("error", message, fields);
  }

  fatal(message: string, fields?: LogOptions) {
    return this.log("fatal", message, fields);
  }

  child(defaults: LoggerDefaults): ProduktiveLogger {
    return new ProduktiveLogger(this.#client, { ...this.#defaults, ...defaults });
  }
}

export function createLogClient(options: ProduktiveLogClientOptions): ProduktiveLogClient {
  return new ProduktiveLogClient(options);
}

export function createLogger(
  options: ProduktiveLogClientOptions,
  defaults: LoggerDefaults = {},
): ProduktiveLogger {
  return createLogClient(options).logger(defaults);
}

export function createEvlogSink(
  clientOrOptions: ProduktiveLogClient | ProduktiveLogClientOptions,
  defaults: LoggerDefaults = {},
): EvlogSink {
  const client =
    clientOrOptions instanceof ProduktiveLogClient
      ? clientOrOptions
      : createLogClient(clientOrOptions);
  return (event: unknown) => client.ingest(normalizeEvlogEvent(event, defaults));
}

export const evlog = createEvlogSink;

export function normalizeEvlogEvent(event: unknown, defaults: LoggerDefaults = {}): LogEvent {
  if (event instanceof Error) {
    return {
      ...defaults,
      level: "error",
      message: event.message,
      error: errorToJson(event),
      timestamp: new Date(),
    };
  }
  if (typeof event === "string") {
    return {
      ...defaults,
      level: "info",
      message: event,
      timestamp: new Date(),
    };
  }
  if (isRecord(event)) {
    const timestamp = readTimestamp(event.timestamp ?? event.time ?? event.ts);
    return {
      ...defaults,
      ...event,
      error: event.error instanceof Error ? errorToJson(event.error) : event.error,
      timestamp: timestamp ?? new Date(),
    };
  }
  return {
    ...defaults,
    level: "info",
    message: String(event),
    timestamp: new Date(),
  };
}

function serializeEvent(event: LogEvent): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    serialized[key] = serializeValue(value);
  }
  return serialized;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return errorToJson(value);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }
  return value;
}

function errorToJson(error: Error): Record<string, string> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack ?? "",
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("Produktive base URL is required");
  return normalized;
}

function readTimestamp(value: unknown): string | number | Date | undefined {
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
