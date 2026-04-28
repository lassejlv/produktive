const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const apiUrl = trimTrailingSlash(
  import.meta.env.VITE_API_URL ?? globalThis.location?.origin ?? "",
);

export const apiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${apiUrl}${normalizedPath}`;
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
};

type UpdateIssueInput = Partial<CreateIssueInput> & {
  assignedToId?: string | null;
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

export type FavoriteTarget = "chat" | "issue";

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
