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
};

type CreateIssueInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
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

export const joinWaitlist = (email: string) =>
  request<{ ok: true }>("/api/waitlist", {
    method: "POST",
    body: JSON.stringify({ email }),
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
