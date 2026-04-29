import { useCallback, useEffect, useState } from "react";
import { apiPath } from "./api";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationMembership = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type AuthSession = {
  user: AuthUser;
  organization: AuthOrganization;
};

type AuthResult = {
  data: AuthSession | null;
  error: { message: string } | null;
};

type EmptyResult = {
  data: { ok: true } | null;
  error: { message: string } | null;
};

type EmailCredentials = {
  email: string;
  password: string;
  name?: string;
};

const requestAuth = async (
  path: string,
  body?: Record<string, unknown>,
): Promise<AuthResult> => {
  const response = await fetch(apiPath(path), {
    method: body ? "POST" : "GET",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    return {
      data: null,
      error: { message: error?.error ?? "Authentication failed" },
    };
  }

  return {
    data: (await response.json()) as AuthSession | null,
    error: null,
  };
};

const requestEmpty = async (
  path: string,
  body: Record<string, unknown>,
): Promise<EmptyResult> => {
  const response = await fetch(apiPath(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    return {
      data: null,
      error: { message: error?.error ?? "Request failed" },
    };
  }

  return {
    data: (await response.json()) as { ok: true },
    error: null,
  };
};

type OrganizationsListResponse = {
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
};

const requestJson = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
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

export const listOrganizations = () =>
  requestJson<OrganizationsListResponse>("/api/auth/organizations");

export const switchOrganization = (organizationId: string) =>
  requestJson<AuthSession>("/api/auth/switch-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });

export const createOrganization = (name: string) =>
  requestJson<{ organization: AuthOrganization }>("/api/auth/organizations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateActiveOrganization = (input: { name: string }) =>
  requestJson<{ organization: AuthOrganization }>(
    "/api/auth/organizations/active",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

export const deleteActiveOrganization = (input: { confirm: string }) =>
  requestJson<{ ok: true; switchedTo: AuthOrganization | null }>(
    "/api/auth/organizations/active",
    {
      method: "DELETE",
      body: JSON.stringify(input),
    },
  );

export const leaveActiveOrganization = () =>
  requestJson<{ ok: true; switchedTo: AuthOrganization | null }>(
    "/api/auth/organizations/active/leave",
    {
      method: "POST",
    },
  );

export const deleteAccount = (confirm: string) =>
  requestJson<{ ok: true }>("/api/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ confirm }),
  });

export const authClient = {
  signIn: {
    email: ({ email, password }: EmailCredentials) =>
      requestAuth("/api/auth/sign-in", { email, password }),
  },
  signUp: {
    email: ({ email, password, name }: EmailCredentials) =>
      requestEmpty("/api/auth/sign-up", { email, password, name }),
  },
  verifyEmail: ({ token }: { token: string }) =>
    requestAuth("/api/auth/verify-email", { token }),
  requestPasswordReset: ({ email }: { email: string }) =>
    requestEmpty("/api/auth/request-password-reset", { email }),
  resetPassword: ({ token, password }: { token: string; password: string }) =>
    requestEmpty("/api/auth/reset-password", { token, password }),
  getSession: () => requestAuth("/api/auth/session"),
};

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;

export const signOut = async () => {
  await fetch(apiPath("/api/auth/sign-out"), {
    method: "POST",
    credentials: "include",
  });
};

type SessionState = {
  data: AuthSession | null;
  error: Error | null;
  status: "initial" | "loading" | "ready" | "error";
};

let sessionState: SessionState = {
  data: null,
  error: null,
  status: "initial",
};
const sessionSubscribers = new Set<() => void>();
let inflightSessionFetch: Promise<void> | null = null;

const notifySessionSubscribers = () => {
  for (const fn of sessionSubscribers) fn();
};

const fetchSession = async () => {
  sessionState = { ...sessionState, status: "loading" };
  notifySessionSubscribers();
  const result = await authClient.getSession();
  if (result.error) {
    sessionState = {
      data: null,
      error: new Error(result.error.message),
      status: "error",
    };
  } else {
    sessionState = { data: result.data, error: null, status: "ready" };
  }
  notifySessionSubscribers();
};

export const refreshSession = (): Promise<void> => {
  if (!inflightSessionFetch) {
    inflightSessionFetch = fetchSession().finally(() => {
      inflightSessionFetch = null;
    });
  }
  return inflightSessionFetch;
};

export const useSession = () => {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const handler = () => forceRender((tick) => tick + 1);
    sessionSubscribers.add(handler);
    if (sessionState.status === "initial") {
      void refreshSession();
    }
    return () => {
      sessionSubscribers.delete(handler);
    };
  }, []);

  return {
    data: sessionState.data,
    error: sessionState.error,
    isPending:
      sessionState.status === "initial" || sessionState.status === "loading",
    refresh: refreshSession,
  };
};

export const useOrganizations = (enabled: boolean) => {
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>(
    [],
  );
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listOrganizations();
      setOrganizations(result.organizations);
      setActiveOrganizationId(result.activeOrganizationId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load organizations",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return {
    organizations,
    activeOrganizationId,
    isLoading,
    error,
    refresh,
  };
};
