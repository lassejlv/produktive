export const DEFAULT_BASE_URL = "https://produktive.app";
export const SANDBOX_TOKEN_HEADER = "x-produktive-sandbox-token";
export const SANDBOX_TOKEN_ENV = "PRODUKTIVE_SANDBOX_TOKEN";

export type ProduktiveFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SandboxStatus =
  | "RUNNING"
  | "STARTING"
  | "COLD"
  | "STOPPED"
  | "UNKNOWN"
  | (string & {});

export interface SandboxRecord {
  id: string;
  name: string;
  slug: string;
  status: SandboxStatus;
  region: string;
  cpus: number;
  memoryMb: number;
  storageGb: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSandboxInput {
  name: string;
  slug?: string;
  region?: string;
  cpus?: number;
  memoryMb?: number;
  storageGb?: number;
}

export interface ExecOptions {
  args?: string[];
  cwd?: string;
  timeoutSec?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface Checkpoint {
  id: string;
  comment: string | null;
  createdAt: string | null;
  sourceId: string | null;
}

export interface OkResponse {
  ok: boolean;
}

export interface ProduktiveSandboxClientOptions {
  token?: string;
  baseUrl?: string;
  fetch?: ProduktiveFetch;
  headers?: HeadersInit;
}

export interface WaitForRunningOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface CreateSandboxOptions
  extends CreateSandboxInput,
    WaitForRunningOptions,
    ProduktiveSandboxClientOptions {}

export class ProduktiveSandboxError extends Error {
  readonly status: number;
  readonly responseText: string;

  constructor(status: number, responseText: string) {
    super(`Produktive sandbox request failed with status ${status}`);
    this.name = "ProduktiveSandboxError";
    this.status = status;
    this.responseText = responseText;
  }
}

export class ProduktiveSandboxAuthError extends Error {
  readonly envVar: string;

  constructor(envVar: string) {
    super(`Missing sandbox API token. Set ${envVar} or pass token explicitly.`);
    this.name = "ProduktiveSandboxAuthError";
    this.envVar = envVar;
  }
}

export class ProduktiveSandboxClient {
  readonly baseUrl: string;

  #token: string;
  #fetch: ProduktiveFetch;
  #headers?: HeadersInit;

  constructor(options: ProduktiveSandboxClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#token = resolveToken(options.token);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#headers = options.headers;
    if (!this.#fetch) {
      throw new Error("No fetch implementation available");
    }
  }

  async list(): Promise<SandboxRecord[]> {
    return this.#request<SandboxRecord[]>("GET", "/api/v1/sandboxes");
  }

  async create(input: CreateSandboxInput): Promise<SandboxRecord> {
    return this.#request<SandboxRecord>("POST", "/api/v1/sandboxes", input);
  }

  async get(id: string): Promise<SandboxRecord> {
    return this.#request<SandboxRecord>("GET", `/api/v1/sandboxes/${encodeURIComponent(id)}`);
  }

  async destroy(id: string): Promise<OkResponse> {
    return this.#request<OkResponse>("DELETE", `/api/v1/sandboxes/${encodeURIComponent(id)}`);
  }

  async exec(id: string, command: string, options: ExecOptions = {}): Promise<ExecResult> {
    return this.#request<ExecResult>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/exec`,
      {
        command,
        args: options.args ?? [],
        cwd: options.cwd,
        timeoutSec: options.timeoutSec,
      },
    );
  }

  async listCheckpoints(id: string): Promise<Checkpoint[]> {
    return this.#request<Checkpoint[]>(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/checkpoints`,
    );
  }

  async createCheckpoint(id: string, comment?: string): Promise<Checkpoint> {
    return this.#request<Checkpoint>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/checkpoints`,
      { comment },
    );
  }

  async restoreCheckpoint(id: string, checkpointId: string): Promise<OkResponse> {
    return this.#request<OkResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
    );
  }

  async deleteCheckpoint(id: string, checkpointId: string): Promise<OkResponse> {
    return this.#request<OkResponse>(
      "DELETE",
      `/api/v1/sandboxes/${encodeURIComponent(id)}/checkpoints/${encodeURIComponent(checkpointId)}`,
    );
  }

  sandbox(record: SandboxRecord): Sandbox {
    return new Sandbox(record, this);
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.#fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...this.#headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ProduktiveSandboxError(response.status, await response.text());
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

export class Sandbox {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: SandboxStatus;
  readonly region: string;
  readonly cpus: number;
  readonly memoryMb: number;
  readonly storageGb: number;
  readonly createdAt: string;
  readonly updatedAt: string;

  #client: ProduktiveSandboxClient;

  constructor(record: SandboxRecord, client: ProduktiveSandboxClient) {
    this.id = record.id;
    this.name = record.name;
    this.slug = record.slug;
    this.status = record.status;
    this.region = record.region;
    this.cpus = record.cpus;
    this.memoryMb = record.memoryMb;
    this.storageGb = record.storageGb;
    this.createdAt = record.createdAt;
    this.updatedAt = record.updatedAt;
    this.#client = client;
  }

  static async create(options: CreateSandboxOptions): Promise<Sandbox> {
    const {
      timeoutMs,
      pollIntervalMs,
      token,
      baseUrl,
      fetch,
      headers,
      ...input
    } = options;

    if (!input.name?.trim()) {
      throw new Error("Sandbox name is required");
    }

    const client = createSandboxClient({ token, baseUrl, fetch, headers });
    const record = await client.create(input);
    const ready = await waitForRunning(client, record.id, { timeoutMs, pollIntervalMs });
    return client.sandbox(ready);
  }

  static async connect(id: string, options: ProduktiveSandboxClientOptions = {}): Promise<Sandbox> {
    const client = createSandboxClient(options);
    const record = await client.get(id);
    return client.sandbox(record);
  }

  static async list(options: ProduktiveSandboxClientOptions = {}): Promise<Sandbox[]> {
    const client = createSandboxClient(options);
    const records = await client.list();
    return records.map((record) => client.sandbox(record));
  }

  async refresh(): Promise<SandboxRecord> {
    const record = await this.#client.get(this.id);
    Object.assign(this, record);
    return record;
  }

  exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    return this.#client.exec(this.id, command, options);
  }

  destroy(): Promise<OkResponse> {
    return this.#client.destroy(this.id);
  }

  listCheckpoints(): Promise<Checkpoint[]> {
    return this.#client.listCheckpoints(this.id);
  }

  createCheckpoint(comment?: string): Promise<Checkpoint> {
    return this.#client.createCheckpoint(this.id, comment);
  }

  restoreCheckpoint(checkpointId: string): Promise<OkResponse> {
    return this.#client.restoreCheckpoint(this.id, checkpointId);
  }

  deleteCheckpoint(checkpointId: string): Promise<OkResponse> {
    return this.#client.deleteCheckpoint(this.id, checkpointId);
  }
}

export function createSandboxClient(
  options: ProduktiveSandboxClientOptions = {},
): ProduktiveSandboxClient {
  return new ProduktiveSandboxClient(options);
}

export async function waitForRunning(
  client: ProduktiveSandboxClient,
  id: string,
  options: WaitForRunningOptions = {},
): Promise<SandboxRecord> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let latest = await client.get(id);

  while (!isRunning(latest.status)) {
    if (Date.now() >= deadline) {
      throw new Error(`Sandbox ${id} did not reach RUNNING within ${timeoutMs}ms`);
    }
    await sleep(pollIntervalMs);
    latest = await client.get(id);
  }

  return latest;
}

export function isRunning(status: SandboxStatus): boolean {
  return status === "RUNNING";
}

function resolveToken(explicit?: string): string {
  const token = explicit?.trim() || readEnv(SANDBOX_TOKEN_ENV);
  if (!token) {
    throw new ProduktiveSandboxAuthError(SANDBOX_TOKEN_ENV);
  }
  return token;
}

function readEnv(name: string): string | undefined {
  const value = globalThis.process?.env?.[name]?.trim();
  return value || undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("Produktive base URL is required");
  return normalized;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
