const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const apiUrl = trimTrailingSlash(
  import.meta.env.VITE_API_URL ?? globalThis.location?.origin ?? "",
);

export const apiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${apiUrl}${normalizedPath}`;
};

export type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
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
  attachments: IssueAttachment[];
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

type CreateIssueInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  parentId?: string | null;
  projectId?: string | null;
};

type UpdateIssueInput = Partial<CreateIssueInput> & {
  assignedToId?: string | null;
  projectId?: string | null;
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

  return response.json() as Promise<T>;
};

export const listIssues = () => request<{ issues: Issue[] }>("/api/issues");

export const getIssue = (id: string) =>
  request<{ issue: Issue }>(`/api/issues/${id}`);

export const getIssueHistory = (id: string) =>
  request<{ events: IssueHistoryEvent[] }>(`/api/issues/${id}/history`);

export const listIssueComments = (id: string) =>
  request<{ comments: IssueComment[] }>(`/api/issues/${id}/comments`);

export const createIssueComment = (id: string, body: string) =>
  request<{ comment: IssueComment }>(`/api/issues/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
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
  request<IssueSubscribersResponse>(`/api/issues/${id}/subscribers`);

export const subscribeToIssue = (id: string) =>
  request<IssueSubscribersResponse>(`/api/issues/${id}/subscribers`, {
    method: "POST",
  });

export const unsubscribeFromIssue = (id: string) =>
  request<IssueSubscribersResponse>(`/api/issues/${id}/subscribers`, {
    method: "DELETE",
  });

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

export const listInbox = () => request<InboxResponse>("/api/inbox");

export const markNotificationRead = (id: string) =>
  request<InboxResponse>(`/api/inbox/${id}/read`, { method: "POST" });

export const markAllNotificationsRead = () =>
  request<InboxResponse>("/api/inbox/read-all", { method: "POST" });

export type NotificationPreferences = {
  emailPaused: boolean;
  emailAssignments: boolean;
  emailComments: boolean;
};

export const getMyPreferences = () =>
  request<NotificationPreferences>("/api/me/preferences");

export const updateMyPreferences = (patch: Partial<NotificationPreferences>) =>
  request<NotificationPreferences>("/api/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export type Invitation = {
  id: string;
  email: string;
  role: string;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
};

export const listInvitations = () =>
  request<{ invitations: Invitation[] }>("/api/organizations/me/invitations");

export const createInvitation = (email: string) =>
  request<Invitation>("/api/organizations/me/invitations", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const revokeInvitation = (id: string) =>
  request<{ invitations: Invitation[] }>(
    `/api/organizations/me/invitations/${id}`,
    { method: "DELETE" },
  );

export const resendInvitation = (id: string) =>
  request<Invitation>(
    `/api/organizations/me/invitations/${id}/resend`,
    { method: "POST" },
  );

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
  request<InvitationLookup>(
    `/api/invitations/lookup?token=${encodeURIComponent(token)}`,
  );

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
  const qs = includeArchived ? "?include_archived=true" : "";
  return request<{ projects: Project[] }>(`/api/projects${qs}`);
};

export const getProject = (id: string) =>
  request<{ project: Project }>(`/api/projects/${id}`);

export const createProject = (input: CreateProjectInput) =>
  request<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateProject = (id: string, patch: UpdateProjectInput) =>
  request<{ project: Project }>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const deleteProject = (id: string) =>
  request<void>(`/api/projects/${id}`, { method: "DELETE" });

export const getMemberProfile = (id: string) =>
  request<{ member: MemberProfile }>(`/api/members/${id}`);

export type Member = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

export const listMembers = () =>
  request<{ members: Member[] }>("/api/members");

export const createIssue = (input: CreateIssueInput) =>
  request<{ issue: Issue }>("/api/issues", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateIssue = (id: string, input: UpdateIssueInput) =>
  request<{ issue: Issue }>(`/api/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deleteIssue = (id: string) =>
  request<{ ok: true }>(`/api/issues/${id}`, {
    method: "DELETE",
  });

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

export const listFavorites = () =>
  request<{ favorites: Favorite[] }>("/api/favorites");

export const addFavorite = (targetType: FavoriteTarget, targetId: string) =>
  request<{
    favorite: {
      id: string;
      targetType: FavoriteTarget;
      targetId: string;
      position: number;
    };
  }>("/api/favorites", {
    method: "POST",
    body: JSON.stringify({ targetType, targetId }),
  });

export const removeFavorite = (targetType: FavoriteTarget, targetId: string) =>
  request<{ ok: true }>(
    `/api/favorites/by/${targetType}/${encodeURIComponent(targetId)}`,
    { method: "DELETE" },
  );

export const reorderFavorites = (favoriteIds: string[]) =>
  request<{ ok: true }>("/api/favorites/reorder", {
    method: "POST",
    body: JSON.stringify({ favoriteIds }),
  });

export type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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

export const listChats = () => request<{ chats: Chat[] }>("/api/chats");

export const createChat = () =>
  request<{ chat: Chat }>("/api/chats", { method: "POST" });

export const getChat = (id: string) =>
  request<{ chat: Chat; messages: ChatMessageRecord[] }>(`/api/chats/${id}`);

export const deleteChat = (id: string) =>
  request<{ ok: true }>(`/api/chats/${id}`, { method: "DELETE" });

export const postChatMessage = (id: string, content: string) =>
  request<{ messages: ChatMessageRecord[] }>(`/api/chats/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

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
  | { type: "error"; error: string };

export const streamChatMessage = async (
  id: string,
  content: string,
  onEvent: (event: ChatStreamEvent) => void,
) => {
  const response = await fetch(apiPath(`/api/chats/${id}/messages/stream`), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
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
