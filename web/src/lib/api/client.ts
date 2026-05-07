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
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
