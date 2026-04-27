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
