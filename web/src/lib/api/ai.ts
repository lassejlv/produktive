import {
  internalGraphQLGet,
  internalGraphQLMutation,
  request,
} from "./client";

export type AiModel = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type AiModelsResponse = {
  models: AiModel[];
  defaultId: string;
};

export type AiBrief = {
  summary: string;
  risks: string[];
  nextActions: string[];
  statusUpdate?: string;
  generatedAt: string;
};

export type IssueDraft = {
  title: string;
  description: string;
  status?: string | null;
  priority?: string | null;
};

export const listAiModels = () =>
  internalGraphQLGet<AiModelsResponse>("/api/ai/models");

export const generateWorkspaceBrief = () =>
  internalGraphQLMutation<AiBrief>("POST", "/api/ai/workspace-brief");

export const generateProjectHealth = (projectId: string) =>
  internalGraphQLMutation<AiBrief>(
    "POST",
    `/api/ai/projects/${projectId}/health`,
  );

export const generateIssueDraft = (input: {
  title: string;
  description?: string;
}) =>
  internalGraphQLMutation<IssueDraft>("POST", "/api/ai/issue-draft", input);

export type McpTool = {
  name: string;
  displayName: string;
  description: string;
};

export type McpServer = {
  id: string;
  name: string;
  slug: string;
  url: string;
  transport: string | null;
  enabled: boolean;
  authType: string;
  authStatus: string;
  tools: McpTool[];
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McpServerEnvelope = {
  server: McpServer;
  oauthUrl: string | null;
};

export type McpApiKey = {
  id: string;
  name: string;
  tokenPrefix: string;
  activeOrganizationId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const listMcpServers = () =>
  internalGraphQLGet<{ servers: McpServer[] }>("/api/ai/mcp/servers");

export const createMcpServer = (input: {
  name?: string;
  url: string;
  accessToken?: string;
}) =>
  internalGraphQLMutation<McpServerEnvelope>(
    "POST",
    "/api/ai/mcp/servers",
    input,
  );

export const updateMcpServer = (
  id: string,
  patch: { name?: string; enabled?: boolean; accessToken?: string },
) =>
  internalGraphQLMutation<McpServerEnvelope>(
    "PATCH",
    `/api/ai/mcp/servers/${id}`,
    patch,
  );

export const deleteMcpServer = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/ai/mcp/servers/${id}`);

export const refreshMcpServerTools = (id: string) =>
  internalGraphQLMutation<McpServerEnvelope>(
    "POST",
    `/api/ai/mcp/servers/${id}/refresh-tools`,
  );

export const startMcpServerOAuth = (id: string) =>
  request<{ url: string }>(`/api/ai/mcp/servers/${id}/oauth/start`, {
    method: "POST",
  });

export const listMcpApiKeys = () =>
  internalGraphQLGet<{ keys: McpApiKey[] }>("/api/api-keys/keys");

export const createMcpApiKey = (input: { name?: string; expiresInDays?: number }) =>
  internalGraphQLMutation<{ key: McpApiKey; token: string }>(
    "POST",
    "/api/api-keys/keys",
    input,
  );

export const revokeMcpApiKey = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/api-keys/keys/${id}`);

export const deleteMcpApiKey = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/api-keys/keys/${id}/delete`);
