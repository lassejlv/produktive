import {
  InternalJsonDocument,
  InternalJsonMutationDocument,
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

type ErrorResponse = {
  error?: string;
};

const readErrorMessage = async (response: Response, fallback: string) => {
  const error: ErrorResponse | null = await response.json().catch(() => null);
  return error?.error ?? fallback;
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

export const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiPath(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Request failed"));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const formRequest = async <T>(
  path: string,
  form: FormData,
  errorMessage = "Request failed",
): Promise<T> => {
  const response = await fetch(apiPath(path), {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, errorMessage));
  }

  return response.json() as Promise<T>;
};

export const fileUploadRequest = <T>(
  path: string,
  file: File,
  errorMessage?: string,
): Promise<T> => {
  const form = new FormData();
  form.append("file", file);
  return formRequest<T>(path, form, errorMessage);
};

export const toQueryString = (
  params: Record<string, string | number | boolean | null | undefined>,
): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
};

export const internalGraphQLGet = <T>(path: string) =>
  graphqlRequest(InternalJsonDocument, { path }).then((data) =>
    unwrapGraphQLJson<T>(data.internalJson),
  );

export const internalGraphQLMutation = <T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) =>
  graphqlRequest(InternalJsonMutationDocument, {
    method,
    path,
    body: body ?? null,
  }).then((data) => unwrapGraphQLJson<T>(data.internalJson));
