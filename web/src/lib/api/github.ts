import {
  internalGraphQLGet,
  internalGraphQLMutation,
  request,
} from "./client";

export type GithubConnection = {
  connected: boolean;
  login: string | null;
  scope: string | null;
  connectedAt: string | null;
};

export type GithubImportPreview = {
  owner: string;
  repo: string;
  total: number;
  newIssues: number;
  updateIssues: number;
  skippedPullRequests: number;
  labels: number;
};

export type GithubImportResult = {
  owner: string;
  repo: string;
  imported: number;
  updated: number;
  skippedPullRequests: number;
  labels: number;
};

export type GithubRepository = {
  id: string;
  owner: string;
  repo: string;
  autoImportEnabled: boolean;
  importIntervalMinutes: number;
  lastImportedAt: string | null;
  nextImportAt: string | null;
  lastImportStatus: string | null;
  lastImportError: string | null;
  lastImportedCount: number;
  lastUpdatedCount: number;
  lastSkippedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GithubRepositoryInput = {
  owner: string;
  repo: string;
  autoImportEnabled?: boolean;
  importIntervalMinutes?: number;
};

export type GithubRepositoryOption = {
  owner: string;
  repo: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
};

export const getGithubConnection = () =>
  internalGraphQLGet<GithubConnection>("/api/github/connection");

export const startGithubOAuth = () =>
  request<{ url: string }>("/api/github/oauth/start", { method: "POST" });

export const disconnectGithub = () =>
  internalGraphQLMutation<void>("DELETE", "/api/github/connection");

export const listGithubRepositories = () =>
  internalGraphQLGet<{ repositories: GithubRepository[] }>(
    "/api/github/repositories",
  );

export const searchGithubRepositories = (params: { q: string }) =>
  internalGraphQLGet<{ repositories: GithubRepositoryOption[] }>(
    `/api/github/repository-search?q=${encodeURIComponent(params.q)}`,
  );

export const createGithubRepository = (input: GithubRepositoryInput) =>
  internalGraphQLMutation<{ repository: GithubRepository }>(
    "POST",
    "/api/github/repositories",
    input,
  );

export const updateGithubRepository = (
  id: string,
  patch: Partial<GithubRepositoryInput>,
) =>
  internalGraphQLMutation<{ repository: GithubRepository }>(
    "PATCH",
    `/api/github/repositories/${id}`,
    patch,
  );

export const deleteGithubRepository = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/github/repositories/${id}`);

export const previewGithubRepositoryImport = (id: string) =>
  internalGraphQLMutation<GithubImportPreview>(
    "POST",
    `/api/github/repositories/${id}/preview`,
  );

export const importGithubRepositoryIssues = (id: string) =>
  internalGraphQLMutation<GithubImportResult>(
    "POST",
    `/api/github/repositories/${id}/import`,
  );

export const previewGithubImport = (input: { owner: string; repo: string }) =>
  internalGraphQLMutation<GithubImportPreview>(
    "POST",
    "/api/github/import/preview",
    input,
  );

export const importGithubIssues = (input: { owner: string; repo: string }) =>
  internalGraphQLMutation<GithubImportResult>(
    "POST",
    "/api/github/import",
    input,
  );
