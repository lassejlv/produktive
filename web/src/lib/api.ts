import {
  ChatAccessDocument,
  ChatDocument,
  ChatsDocument,
  CloseAllTabsDocument,
  CloseTabDocument,
  CreateChatDocument,
  CreateIssueDocument,
  CreateIssueStatusDocument,
  CreateLabelDocument,
  CreateProjectDocument,
  DeleteChatDocument,
  DeleteIssueDocument,
  DeleteIssueStatusDocument,
  DeleteLabelDocument,
  DeleteProjectDocument,
  GrantChatAccessDocument,
  InboxDocument,
  InternalJsonDocument,
  InternalJsonMutationDocument,
  IssueDocument,
  IssueStatusesDocument,
  IssuesDocument,
  LabelDocument,
  LabelsDocument,
  MarkAllNotificationsReadDocument,
  MarkNotificationReadDocument,
  MembersDocument,
  OpenTabDocument,
  ProjectDocument,
  PreferencesDocument,
  PostChatMessageDocument,
  ProjectsDocument,
  ReorderIssueStatusesDocument,
  RevokeChatAccessDocument,
  TabsDocument,
  UpdateIssueDocument,
  UpdateIssueStatusDocument,
  UpdateLabelDocument,
  UpdatePreferencesDocument,
  UpdateProjectDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/graphql/client";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const apiUrl = trimTrailingSlash(
  import.meta.env.VITE_API_URL ?? globalThis.location?.origin ?? "",
);

(
  globalThis as typeof globalThis & { __produktiveApiClientBuild?: string }
).__produktiveApiClientBuild = "2026-05-01.asset-cache-refresh";

export const apiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${apiUrl}${normalizedPath}`;
};

export const apiWebSocketPath = (path: string) => {
  const target = apiPath(path);
  const base =
    typeof window !== "undefined" && window.location?.href
      ? window.location.href
      : "http://localhost";
  const url = new URL(target, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
};

export type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

export type LabelSummary = {
  id: string;
  name: string;
  color: string;
};

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  parentId?: string | null;
  projectId?: string | null;
  project?: ProjectSummary | null;
  labels?: LabelSummary[];
  attachments: IssueAttachment[];
};

export type IssueStatusCategory = "backlog" | "active" | "done" | "canceled";

export type IssueStatus = {
  id: string;
  key: string;
  name: string;
  color: string;
  category: IssueStatusCategory;
  sortOrder: number;
  isSystem: boolean;
  archived: boolean;
};

export type IssueAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  key: string;
  url: string;
  createdAt: string;
};

export type IssueHistoryEvent = {
  id: string;
  action: "created" | "updated" | "attachment_added" | string;
  changes: IssueHistoryChange[];
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
};

export type IssueComment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
};

export type IssueHistoryChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type MemberIssue = {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
};

export type MemberActivity = {
  id: string;
  action: string;
  changes: IssueHistoryChange[];
  createdAt: string;
  issue: MemberIssue | null;
};

export type MemberProfile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  twoFactorEnabled: boolean;
  activeSessions: number;
  joinedAt: string;
  stats: {
    assignedIssues: number;
    createdIssues: number;
    activityEvents: number;
  };
  assignedIssues: MemberIssue[];
  createdIssues: MemberIssue[];
  activity: MemberActivity[];
};

export type NoteMentionTargetType = "issue" | "chat" | "user";

export type NoteMention = {
  targetType: NoteMentionTargetType;
  targetId: string;
  label: string;
  subtitle: string | null;
};

export type Note = {
  id: string;
  folderId: string | null;
  title: string;
  bodyMarkdown: string;
  committedBodyMarkdown: string | null;
  bodySnippet: string | null;
  bodySha256: string | null;
  currentVersionId: string | null;
  hasUncommittedChanges: boolean;
  latestVersion: NoteVersion | null;
  visibility: "workspace" | "private";
  createdBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  updatedBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  mentions: NoteMention[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type NoteVersion = {
  id: string;
  noteId: string;
  bodySha256: string;
  parentVersionId: string | null;
  commitMessage: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  createdAt: string;
};

export type NoteFolder = {
  id: string;
  name: string;
  visibility: "workspace" | "private";
  createdBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type NoteMentionSearchResult = NoteMention;

type CreateIssueInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedToId?: string | null;
  parentId?: string | null;
  projectId?: string | null;
  labelIds?: string[];
};

type UpdateIssueInput = Partial<CreateIssueInput> & {
  assignedToId?: string | null;
  projectId?: string | null;
  labelIds?: string[];
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiPath(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

const internalGraphQLGet = <T>(path: string) =>
  graphqlRequest(InternalJsonDocument, { path }).then((data) =>
    unwrapGraphQLJson<T>(data.internalJson),
  );

const internalGraphQLMutation = <T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) =>
  graphqlRequest(InternalJsonMutationDocument, {
    method,
    path,
    body: body ?? null,
  }).then((data) => unwrapGraphQLJson<T>(data.internalJson));

export const listIssues = () =>
  graphqlRequest(IssuesDocument, {}).then((data) =>
    unwrapGraphQLJson<{ issues: Issue[] }>(data.issues),
  );

export const listIssueStatuses = () =>
  graphqlRequest(IssueStatusesDocument, {}).then((data) =>
    unwrapGraphQLJson<{ statuses: IssueStatus[] }>(data.issueStatuses),
  );

export const createIssueStatus = (input: {
  name: string;
  color?: string;
  category: IssueStatusCategory;
}) =>
  graphqlRequest(CreateIssueStatusDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ status: IssueStatus }>(data.createIssueStatus),
  );

export const updateIssueStatus = (
  id: string,
  input: { name: string; color?: string; category: IssueStatusCategory },
) =>
  graphqlRequest(UpdateIssueStatusDocument, { id, input }).then((data) =>
    unwrapGraphQLJson<{ status: IssueStatus }>(data.updateIssueStatus),
  );

export const deleteIssueStatus = (id: string, replacementStatus?: string) =>
  graphqlRequest(DeleteIssueStatusDocument, {
    id,
    input: replacementStatus ? { replacementStatus } : null,
  }).then(() => undefined);

export const reorderIssueStatuses = (statuses: { id: string; sortOrder: number }[]) =>
  graphqlRequest(ReorderIssueStatusesDocument, { statuses }).then((data) =>
    unwrapGraphQLJson<{ statuses: IssueStatus[] }>(data.reorderIssueStatuses),
  );

export const getIssue = (id: string) =>
  graphqlRequest(IssueDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ issue: Issue }>(data.issue),
  );

export const listNotes = (search?: string) => {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return internalGraphQLGet<{ notes: Note[] }>(`/api/notes${suffix}`);
};

export const createNote = (input?: {
  title?: string;
  bodyMarkdown?: string;
  folderId?: string | null;
  visibility?: "workspace" | "private";
}) => internalGraphQLMutation<{ note: Note }>("POST", "/api/notes", input ?? {});

export const getNote = (id: string) => internalGraphQLGet<{ note: Note }>(`/api/notes/${id}`);

export const updateNote = (
  id: string,
  patch: {
    title?: string;
    bodyMarkdown?: string;
    folderId?: string | null;
    visibility?: "workspace" | "private";
  },
) => internalGraphQLMutation<{ note: Note }>("PATCH", `/api/notes/${id}`, patch);

export const archiveNote = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/notes/${id}`);

export const listNoteVersions = (id: string) =>
  internalGraphQLGet<{ versions: NoteVersion[] }>(`/api/notes/${id}/versions`);

export const commitNote = (id: string, input?: { message?: string }) =>
  internalGraphQLMutation<{ version: NoteVersion }>("POST", `/api/notes/${id}/commit`, input ?? {});

export const restoreNoteVersion = (id: string, versionId: string) =>
  internalGraphQLMutation<{ note: Note }>(
    "POST",
    `/api/notes/${id}/versions/${versionId}/restore`,
    {},
  );

export const proposeNoteAiEdit = (
  id: string,
  input: {
    selectedText: string;
    instruction?: string;
    title?: string;
    bodyMarkdown?: string;
  },
) =>
  internalGraphQLMutation<{ replacementMarkdown: string }>(
    "POST",
    `/api/notes/${id}/ai/edit`,
    input,
  );

export const listNoteFolders = () =>
  internalGraphQLGet<{ folders: NoteFolder[] }>("/api/notes/folders");

export const createNoteFolder = (input: { name: string; visibility?: "workspace" | "private" }) =>
  internalGraphQLMutation<{ folder: NoteFolder }>("POST", "/api/notes/folders", input);

export const updateNoteFolder = (
  id: string,
  patch: { name?: string; visibility?: "workspace" | "private" },
) => internalGraphQLMutation<{ folder: NoteFolder }>("PATCH", `/api/notes/folders/${id}`, patch);

export const archiveNoteFolder = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/notes/folders/${id}`);

export const searchNoteMentions = (q: string) =>
  internalGraphQLGet<{ mentions: NoteMentionSearchResult[] }>(
    `/api/notes/mentions?q=${encodeURIComponent(q)}`,
  );

export const getIssueHistory = (id: string) =>
  internalGraphQLGet<{ events: IssueHistoryEvent[] }>(`/api/issues/${id}/history`);

export const listIssueComments = (id: string) =>
  internalGraphQLGet<{ comments: IssueComment[] }>(`/api/issues/${id}/comments`);

export const createIssueComment = (id: string, body: string) =>
  internalGraphQLMutation<{ comment: IssueComment }>("POST", `/api/issues/${id}/comments`, {
    body,
  });

export type IssueSubscriberUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type IssueSubscribersResponse = {
  subscribers: IssueSubscriberUser[];
  subscribed: boolean;
};

export const listIssueSubscribers = (id: string) =>
  internalGraphQLGet<IssueSubscribersResponse>(`/api/issues/${id}/subscribers`);

export const subscribeToIssue = (id: string) =>
  internalGraphQLMutation<IssueSubscribersResponse>("POST", `/api/issues/${id}/subscribers`);

export const unsubscribeFromIssue = (id: string) =>
  internalGraphQLMutation<IssueSubscribersResponse>("DELETE", `/api/issues/${id}/subscribers`);

export type InboxNotification = {
  id: string;
  kind: string;
  targetType: string;
  targetId: string;
  title: string;
  snippet: string | null;
  createdAt: string;
  readAt: string | null;
  actor: {
    id: string;
    name: string;
    image: string | null;
  } | null;
};

export type InboxResponse = {
  notifications: InboxNotification[];
  unreadCount: number;
};

export const listInbox = () =>
  graphqlRequest(InboxDocument, {}).then((data) => unwrapGraphQLJson<InboxResponse>(data.inbox));

export const markNotificationRead = (id: string) =>
  graphqlRequest(MarkNotificationReadDocument, { id }).then((data) =>
    unwrapGraphQLJson<InboxResponse>(data.markNotificationRead),
  );

export const markAllNotificationsRead = () =>
  graphqlRequest(MarkAllNotificationsReadDocument, {}).then((data) =>
    unwrapGraphQLJson<InboxResponse>(data.markAllNotificationsRead),
  );

export type SidebarLayoutItem = {
  id: string;
  hidden?: boolean;
};

// The wire format is opaque JSON — see lib/use-sidebar-layout for normalization.
export type NotificationPreferences = {
  emailPaused: boolean;
  emailAssignments: boolean;
  emailComments: boolean;
  emailProgress: boolean;
  tabsEnabled: boolean;
  sidebarLayout: unknown;
};

export const getMyPreferences = () =>
  graphqlRequest(PreferencesDocument, {}).then((data) =>
    unwrapGraphQLJson<NotificationPreferences>(data.preferences),
  );

export const updateMyPreferences = (patch: Partial<NotificationPreferences>) =>
  graphqlRequest(UpdatePreferencesDocument, { input: patch }).then((data) =>
    unwrapGraphQLJson<NotificationPreferences>(data.updatePreferences),
  );

export type TabType = "issue" | "project" | "chat" | "page";

export type WorkspaceTab = {
  id: string;
  tabType: TabType;
  targetId: string;
  title: string;
  openedAt: string;
};

export const listTabs = () =>
  graphqlRequest(TabsDocument, {}).then((data) => unwrapGraphQLJson<WorkspaceTab[]>(data.tabs));

export const openTab = (input: { tabType: TabType; targetId: string; title: string }) =>
  graphqlRequest(OpenTabDocument, { input }).then((data) =>
    unwrapGraphQLJson<WorkspaceTab>(data.openTab),
  );

export const closeTab = (id: string) =>
  graphqlRequest(CloseTabDocument, { id }).then(() => undefined as void);

export const closeAllTabs = () =>
  graphqlRequest(CloseAllTabsDocument, {}).then(() => undefined as void);

export type OnboardingPatch = {
  completed?: boolean;
  step?: string;
};

export type OnboardingUserResponse = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  onboardingCompletedAt: string | null;
  onboardingStep: string | null;
};

export const markOnboarding = (patch: OnboardingPatch) =>
  internalGraphQLMutation<OnboardingUserResponse>("PATCH", "/api/me/onboarding", patch);

export type OAuthAuthorizePreview = {
  clientName: string;
  scope: string;
  resource: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const previewOAuthAuthorization = (search: string) =>
  request<OAuthAuthorizePreview>(`/api/oauth/authorize${search}`);

export const decideOAuthAuthorization = (search: string, approve: boolean) => {
  const params = new URLSearchParams(search);
  return request<{ redirectUrl: string }>("/api/oauth/authorize", {
    method: "POST",
    body: JSON.stringify({
      responseType: params.get("response_type") ?? "",
      clientId: params.get("client_id") ?? "",
      redirectUri: params.get("redirect_uri") ?? "",
      state: params.get("state") || undefined,
      scope: params.get("scope") || undefined,
      codeChallenge: params.get("code_challenge") ?? "",
      codeChallengeMethod: params.get("code_challenge_method") ?? "",
      resource: params.get("resource") || undefined,
      approve,
    }),
  });
};

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

export const listMcpServers = () =>
  internalGraphQLGet<{ servers: McpServer[] }>("/api/ai/mcp/servers");

export type AiModel = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type AiModelsResponse = {
  models: AiModel[];
  defaultId: string;
};

export const listAiModels = () => internalGraphQLGet<AiModelsResponse>("/api/ai/models");

export type AiBrief = {
  summary: string;
  risks: string[];
  nextActions: string[];
  statusUpdate?: string;
  generatedAt: string;
};

export const generateWorkspaceBrief = () =>
  internalGraphQLMutation<AiBrief>("POST", "/api/ai/workspace-brief");

export const generateProjectHealth = (projectId: string) =>
  internalGraphQLMutation<AiBrief>("POST", `/api/ai/projects/${projectId}/health`);

export type IssueDraft = {
  title: string;
  description: string;
  status?: string | null;
  priority?: string | null;
};

export const generateIssueDraft = (input: { title: string; description?: string }) =>
  internalGraphQLMutation<IssueDraft>("POST", "/api/ai/issue-draft", input);

export const createMcpServer = (input: { name?: string; url: string; accessToken?: string }) =>
  internalGraphQLMutation<McpServerEnvelope>("POST", "/api/ai/mcp/servers", input);

export const updateMcpServer = (
  id: string,
  patch: { name?: string; enabled?: boolean; accessToken?: string },
) => internalGraphQLMutation<McpServerEnvelope>("PATCH", `/api/ai/mcp/servers/${id}`, patch);

export const deleteMcpServer = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/ai/mcp/servers/${id}`);

export const refreshMcpServerTools = (id: string) =>
  internalGraphQLMutation<McpServerEnvelope>("POST", `/api/ai/mcp/servers/${id}/refresh-tools`);

export const startMcpServerOAuth = (id: string) =>
  request<{ url: string }>(`/api/ai/mcp/servers/${id}/oauth/start`, {
    method: "POST",
  });

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

export const listMcpApiKeys = () => internalGraphQLGet<{ keys: McpApiKey[] }>("/api/api-keys/keys");

export const createMcpApiKey = (input: { name?: string; expiresInDays?: number }) =>
  internalGraphQLMutation<{ key: McpApiKey; token: string }>("POST", "/api/api-keys/keys", input);

export const revokeMcpApiKey = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/api-keys/keys/${id}`);

export const deleteMcpApiKey = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/api-keys/keys/${id}/delete`);

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
  internalGraphQLGet<{ repositories: GithubRepository[] }>("/api/github/repositories");

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

export const updateGithubRepository = (id: string, patch: Partial<GithubRepositoryInput>) =>
  internalGraphQLMutation<{ repository: GithubRepository }>(
    "PATCH",
    `/api/github/repositories/${id}`,
    patch,
  );

export const deleteGithubRepository = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/github/repositories/${id}`);

export const previewGithubRepositoryImport = (id: string) =>
  internalGraphQLMutation<GithubImportPreview>("POST", `/api/github/repositories/${id}/preview`);

export const importGithubRepositoryIssues = (id: string) =>
  internalGraphQLMutation<GithubImportResult>("POST", `/api/github/repositories/${id}/import`);

export const previewGithubImport = (input: { owner: string; repo: string }) =>
  internalGraphQLMutation<GithubImportPreview>("POST", "/api/github/import/preview", input);

export const importGithubIssues = (input: { owner: string; repo: string }) =>
  internalGraphQLMutation<GithubImportResult>("POST", "/api/github/import", input);

export type SlackConnection = {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  botUserId: string | null;
  scope: string | null;
  agentEnabled: boolean;
  connectedAt: string | null;
};

export const getSlackConnection = () =>
  internalGraphQLGet<SlackConnection>("/api/slack/connection");

export const startSlackOAuth = () =>
  request<{ url: string }>("/api/slack/oauth/start", { method: "POST" });

export const updateSlackConnection = (patch: { agentEnabled?: boolean }) =>
  internalGraphQLMutation<SlackConnection>("PATCH", "/api/slack/connection", patch);

export const disconnectSlack = () =>
  internalGraphQLMutation<void>("DELETE", "/api/slack/connection");

export type Invitation = {
  id: string;
  email: string;
  role: string;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
};

export const listInvitations = () =>
  internalGraphQLGet<{ invitations: Invitation[] }>("/api/organizations/me/invitations");

export const createInvitation = (email: string, role?: string) =>
  internalGraphQLMutation<Invitation>("POST", "/api/organizations/me/invitations", { email, role });

export const revokeInvitation = (id: string) =>
  internalGraphQLMutation<{ invitations: Invitation[] }>(
    "DELETE",
    `/api/organizations/me/invitations/${id}`,
  );

export const resendInvitation = (id: string) =>
  internalGraphQLMutation<Invitation>("POST", `/api/organizations/me/invitations/${id}/resend`);

export type InvitationLookup = {
  valid: boolean;
  expired: boolean;
  revoked: boolean;
  accepted: boolean;
  organizationName: string | null;
  inviterName: string | null;
  email: string | null;
};

export const lookupInvitation = (token: string) =>
  request<InvitationLookup>(`/api/invitations/lookup?token=${encodeURIComponent(token)}`);

export type AcceptInvitationResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const acceptInvitation = (token: string) =>
  request<AcceptInvitationResponse>("/api/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export type ProjectLead = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type ProjectStatusBreakdown = {
  backlog: number;
  todo: number;
  inProgress: number;
  done: number;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  color: string;
  icon: string | null;
  leadId: string | null;
  lead: ProjectLead | null;
  targetDate: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  doneCount: number;
  statusBreakdown: ProjectStatusBreakdown;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  status?: string;
  color?: string;
  icon?: string | null;
  leadId?: string | null;
  targetDate?: string | null;
};

export type UpdateProjectInput = Partial<CreateProjectInput> & {
  archived?: boolean;
};

export const listProjects = (includeArchived = false) => {
  return graphqlRequest(ProjectsDocument, { includeArchived }).then((data) =>
    unwrapGraphQLJson<{ projects: Project[] }>(data.projects),
  );
};

export const getProject = (id: string) =>
  graphqlRequest(ProjectDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ project: Project }>(data.project),
  );

export const createProject = (input: CreateProjectInput) =>
  graphqlRequest(CreateProjectDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ project: Project }>(data.createProject),
  );

export const updateProject = (id: string, patch: UpdateProjectInput) =>
  graphqlRequest(UpdateProjectDocument, { id, input: patch }).then((data) =>
    unwrapGraphQLJson<{ project: Project }>(data.updateProject),
  );

export const deleteProject = (id: string) =>
  graphqlRequest(DeleteProjectDocument, { id }).then(() => undefined as void);

export type Label = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
};

export type CreateLabelInput = {
  name: string;
  description?: string;
  color?: string;
};

export type UpdateLabelInput = Partial<CreateLabelInput> & {
  archived?: boolean;
};

export const listLabels = (includeArchived = false) => {
  return graphqlRequest(LabelsDocument, { includeArchived }).then((data) =>
    unwrapGraphQLJson<{ labels: Label[] }>(data.labels),
  );
};

export const getLabel = (id: string) =>
  graphqlRequest(LabelDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ label: Label }>(data.label),
  );

export const createLabel = (input: CreateLabelInput) =>
  graphqlRequest(CreateLabelDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ label: Label }>(data.createLabel),
  );

export const updateLabel = (id: string, patch: UpdateLabelInput) =>
  graphqlRequest(UpdateLabelDocument, { id, input: patch }).then((data) =>
    unwrapGraphQLJson<{ label: Label }>(data.updateLabel),
  );

export const deleteLabel = (id: string) =>
  graphqlRequest(DeleteLabelDocument, { id }).then(() => undefined as void);

export const getMemberProfile = (id: string) =>
  internalGraphQLGet<{ member: MemberProfile }>(`/api/members/${id}`);

export type Member = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  twoFactorEnabled: boolean;
  activeSessions: number;
};

export const listMembers = () =>
  graphqlRequest(MembersDocument, {}).then((data) =>
    unwrapGraphQLJson<{ members: Member[] }>(data.members),
  );

export type SecurityEventUser = {
  id: string;
  name: string;
  email: string;
};

export type SecurityEvent = {
  id: string;
  eventType: string;
  actor: SecurityEventUser | null;
  target: SecurityEventUser | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const listSecurityEvents = () =>
  internalGraphQLGet<{ events: SecurityEvent[] }>("/api/security/events");

export const sendTwoFactorNudges = () =>
  internalGraphQLMutation<{ sent: number }>("POST", "/api/security/two-factor-nudges");

export const recordTwoFactorEnforcementBlocked = () =>
  internalGraphQLMutation<{ ok: true }>("POST", "/api/security/two-factor-enforcement/blocked");

export type PermissionInfo = {
  key: string;
  label: string;
  group: string;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  archived: boolean;
};

export const listRoles = () =>
  internalGraphQLGet<{ roles: Role[]; permissions: PermissionInfo[] }>("/api/roles");

export const createRole = (input: { name: string; description?: string; permissions: string[] }) =>
  internalGraphQLMutation<{ role: Role }>("POST", "/api/roles", input);

export const updateRole = (
  id: string,
  input: { name: string; description?: string; permissions: string[] },
) => internalGraphQLMutation<{ role: Role }>("PATCH", `/api/roles/${id}`, input);

export const deleteRole = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/roles/${id}`);

export const updateMemberRole = (id: string, role: string) =>
  internalGraphQLMutation<void>("PATCH", `/api/members/${id}`, { role });

export const removeMember = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/members/${id}`);

export const resetMemberTwoFactor = (userId: string) =>
  internalGraphQLMutation<void>("POST", "/api/security/two-factor-recovery/reset", { userId });

export const revokeMemberSessions = (userId: string) =>
  internalGraphQLMutation<{ revoked: number }>("POST", "/api/security/member-sessions/revoke", {
    userId,
  });

export const createIssue = (input: CreateIssueInput) =>
  graphqlRequest(CreateIssueDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ issue: Issue }>(data.createIssue),
  );

export const updateIssue = (id: string, input: UpdateIssueInput) =>
  graphqlRequest(UpdateIssueDocument, { id, input }).then((data) =>
    unwrapGraphQLJson<{ issue: Issue }>(data.updateIssue),
  );

export const deleteIssue = (id: string) =>
  graphqlRequest(DeleteIssueDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ ok: true }>(data.deleteIssue),
  );

export const uploadIssueAttachment = async (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiPath(`/api/issues/${id}/attachments`), {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Failed to upload attachment");
  }

  return response.json() as Promise<{ issue: Issue }>;
};

export const joinWaitlist = (email: string) =>
  request<{ ok: true }>("/api/waitlist", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export type FavoriteTarget = "chat" | "issue" | "project";

export type Favorite =
  | {
      type: "chat";
      id: string;
      favoriteId: string;
      title: string;
      position: number;
    }
  | {
      type: "issue";
      id: string;
      favoriteId: string;
      title: string;
      status: string;
      priority: string;
      position: number;
    }
  | {
      type: "project";
      id: string;
      favoriteId: string;
      title: string;
      color: string;
      icon: string | null;
      status: string;
      position: number;
    };

export const listFavorites = () => internalGraphQLGet<{ favorites: Favorite[] }>("/api/favorites");

export const addFavorite = (targetType: FavoriteTarget, targetId: string) =>
  internalGraphQLMutation<{
    favorite: {
      id: string;
      targetType: FavoriteTarget;
      targetId: string;
      position: number;
    };
  }>("POST", "/api/favorites", { targetType, targetId });

export const removeFavorite = (targetType: FavoriteTarget, targetId: string) =>
  internalGraphQLMutation<{ ok: true }>(
    "DELETE",
    `/api/favorites/by/${targetType}/${encodeURIComponent(targetId)}`,
  );

export const reorderFavorites = (favoriteIds: string[]) =>
  internalGraphQLMutation<{ ok: true }>("POST", "/api/favorites/reorder", { favoriteIds });

export type Chat = {
  id: string;
  title: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatAccessEntry = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  isCreator: boolean;
};

export type ChatMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolCalls?: ChatToolCallRecord[];
};

export type ChatToolCallRecord = {
  id: string;
  name: string;
  arguments: string;
  result?: unknown;
};

export type UploadedChatAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  key: string;
  url: string;
};

export const listChats = () =>
  graphqlRequest(ChatsDocument, {}).then((data) =>
    unwrapGraphQLJson<{ chats: Chat[] }>(data.chats),
  );

export const createChat = () =>
  graphqlRequest(CreateChatDocument, {}).then((data) =>
    unwrapGraphQLJson<{ chat: Chat }>(data.createChat),
  );

export const getChat = (id: string) =>
  graphqlRequest(ChatDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ chat: Chat; messages: ChatMessageRecord[] }>(data.chat),
  );

export const deleteChat = (id: string) =>
  graphqlRequest(DeleteChatDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ ok: true }>(data.deleteChat),
  );

export const listChatAccess = (id: string) =>
  graphqlRequest(ChatAccessDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ access: ChatAccessEntry[] }>(data.chatAccess),
  );

export const grantChatAccess = (id: string, userId: string) =>
  graphqlRequest(GrantChatAccessDocument, { id, input: { userId } }).then((data) =>
    unwrapGraphQLJson<{ access: ChatAccessEntry }>(data.grantChatAccess),
  );

export const revokeChatAccess = (id: string, userId: string) =>
  graphqlRequest(RevokeChatAccessDocument, { id, userId }).then((data) =>
    unwrapGraphQLJson<{ ok: true }>(data.revokeChatAccess),
  );

export const postChatMessage = (id: string, content: string) =>
  graphqlRequest(PostChatMessageDocument, { id, input: { content } }).then((data) =>
    unwrapGraphQLJson<{ messages: ChatMessageRecord[] }>(data.postChatMessage),
  );

export const uploadChatAttachment = async (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiPath(`/api/chats/${id}/attachments`), {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Failed to upload attachment");
  }

  return response.json() as Promise<UploadedChatAttachment>;
};

export type ChatStreamEvent =
  | { type: "user"; message: ChatMessageRecord }
  | { type: "delta"; content: string }
  | { type: "done"; messages: ChatMessageRecord[] }
  | { type: "error"; error: string; messages?: ChatMessageRecord[] };

export const streamChatMessage = async (
  id: string,
  content: string,
  onEvent: (event: ChatStreamEvent) => void,
  options?: { model?: string },
) => {
  const body: Record<string, unknown> = { content };
  if (options?.model) body.model = options.model;
  const response = await fetch(apiPath(`/api/chats/${id}/messages/stream`), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Request failed");
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this browser");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed) as ChatStreamEvent);
    }
  }

  buffer += decoder.decode();
  const trimmed = buffer.trim();
  if (trimmed) {
    onEvent(JSON.parse(trimmed) as ChatStreamEvent);
  }
};

export type DiscordLinkPreview = {
  guildId: string;
  discordUserId: string;
  expiresAt: string;
  linkedOrganization: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type DiscordLinkResult = {
  ok: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const previewDiscordLink = (state: string) =>
  request<DiscordLinkPreview>(`/api/discord/link/${encodeURIComponent(state)}`);

export const completeDiscordLink = (state: string, organizationId: string) =>
  request<DiscordLinkResult>(`/api/discord/link/${encodeURIComponent(state)}`, {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });

export type SlackLinkPreview = {
  slackTeamId: string;
  slackUserId: string;
  expiresAt: string;
  linkedOrganization: {
    id: string;
    name: string;
    slug: string;
  };
};

export type SlackLinkResult = {
  ok: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const previewSlackLink = (state: string) =>
  request<SlackLinkPreview>(`/api/slack/link/${encodeURIComponent(state)}`);

export const completeSlackLink = (state: string) =>
  request<SlackLinkResult>(`/api/slack/link/${encodeURIComponent(state)}`, {
    method: "POST",
  });
