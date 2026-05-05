import { useCallback, useEffect, useState } from "react";
import { apiPath } from "./api";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  image: string | null;
  onboardingCompletedAt: string | null;
  onboardingStep: string | null;
};

type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  requireTwoFactor: boolean;
};

export type OrganizationMembership = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
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

type SignInResult = AuthResult & {
  twoFactorRequired?: boolean;
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

type GithubOAuthOptions = {
  invite?: string | null;
  redirect?: string | null;
};

type SessionState = {
  data: AuthSession | null;
  error: Error | null;
  status: "initial" | "loading" | "ready" | "error";
};

const requestAuth = async (path: string, body?: Record<string, unknown>): Promise<AuthResult> => {
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

const requestEmpty = async (path: string, body: Record<string, unknown>): Promise<EmptyResult> => {
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

export type AccountSession = {
  id: string;
  current: boolean;
  activeOrganizationId: string;
  activeOrganizationName: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type SessionsListResponse = {
  sessions: AccountSession[];
};

export type TwoFactorStatus = {
  enabled: boolean;
  backupCodesRemaining: number;
};

export type TwoFactorSetup = {
  secret: string;
  totpUri: string;
};

export type TwoFactorBackupCodes = {
  backupCodes: string[];
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
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

const requestUpload = async <T>(path: string, file: File): Promise<T> => {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(apiPath(path), {
    method: "POST",
    credentials: "include",
    body,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Upload failed");
  }

  return response.json() as Promise<T>;
};

const requestSignIn = async (email: string, password: string): Promise<SignInResult> => {
  const response = await fetch(apiPath("/api/auth/sign-in"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    return {
      data: null,
      error: { message: error?.error ?? "Authentication failed" },
    };
  }

  const data = (await response.json()) as AuthSession | { twoFactorRequired: true };
  if ("twoFactorRequired" in data) {
    return { data: null, error: null, twoFactorRequired: true };
  }

  return applySessionResult({ data, error: null });
};

let sessionState: SessionState = {
  data: null,
  error: null,
  status: "initial",
};
const sessionSubscribers = new Set<() => void>();
let inflightSessionFetch: Promise<void> | null = null;
let sessionWriteVersion = 0;

const notifySessionSubscribers = () => {
  for (const fn of sessionSubscribers) fn();
};

const applySessionResult = (result: AuthResult): AuthResult => {
  if (!result.error && result.data) {
    sessionWriteVersion += 1;
    sessionState = { data: result.data, error: null, status: "ready" };
    notifySessionSubscribers();
  }
  return result;
};

const clearSession = () => {
  sessionWriteVersion += 1;
  sessionState = { data: null, error: null, status: "ready" };
  notifySessionSubscribers();
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

export const updateActiveOrganization = (input: { name?: string; requireTwoFactor?: boolean }) =>
  requestJson<{ organization: AuthOrganization }>("/api/auth/organizations/active", {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const uploadActiveOrganizationIcon = (file: File) =>
  requestUpload<{ organization: AuthOrganization }>("/api/auth/organizations/active/icon", file);

export const deleteActiveOrganization = (input: { confirm: string }) =>
  requestJson<{ ok: true; switchedTo: AuthOrganization | null }>("/api/auth/organizations/active", {
    method: "DELETE",
    body: JSON.stringify(input),
  });

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

export const uploadAccountIcon = (file: File) =>
  requestUpload<AuthSession>("/api/auth/account/icon", file).then((data) => {
    applySessionResult({ data, error: null });
    return data;
  });

export const listAccountSessions = () => requestJson<SessionsListResponse>("/api/auth/sessions");

export const revokeAccountSession = (id: string) =>
  requestJson<{ ok: true }>(`/api/auth/sessions/${id}`, {
    method: "DELETE",
  });

export const revokeOtherAccountSessions = () =>
  requestJson<{ ok: true }>("/api/auth/sessions", {
    method: "DELETE",
  });

export const getTwoFactorStatus = () => requestJson<TwoFactorStatus>("/api/auth/two-factor/status");

export const setupTwoFactor = (password: string) =>
  requestJson<TwoFactorSetup>("/api/auth/two-factor/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const enableTwoFactor = (code: string) =>
  requestJson<TwoFactorBackupCodes>("/api/auth/two-factor/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const disableTwoFactor = (input: { password: string; code: string }) =>
  requestJson<{ ok: true }>("/api/auth/two-factor/disable", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const regenerateTwoFactorBackupCodes = (input: { password: string; code: string }) =>
  requestJson<TwoFactorBackupCodes>("/api/auth/two-factor/backup-codes", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const refreshTwoFactor = (code: string) =>
  requestJson<{ ok: true }>("/api/auth/two-factor/fresh", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const authClient = {
  signIn: {
    email: ({ email, password }: EmailCredentials) => requestSignIn(email, password),
    githubUrl: ({ invite, redirect }: GithubOAuthOptions = {}) => {
      const url = new URL(apiPath("/api/auth/github/start"), window.location.origin);
      if (invite) url.searchParams.set("invite", invite);
      if (redirect) url.searchParams.set("redirect", redirect);
      return url.toString();
    },
  },
  signUp: {
    email: ({ email, password, name }: EmailCredentials) =>
      requestEmpty("/api/auth/sign-up", { email, password, name }),
  },
  verifyEmail: ({ token }: { token: string }) =>
    requestAuth("/api/auth/verify-email", { token }).then(applySessionResult),
  requestPasswordReset: ({ email }: { email: string }) =>
    requestEmpty("/api/auth/request-password-reset", { email }),
  resetPassword: ({ token, password }: { token: string; password: string }) =>
    requestEmpty("/api/auth/reset-password", { token, password }),
  verifyTwoFactorLogin: ({
    code,
    rememberDevice,
  }: {
    code: string;
    rememberDevice?: boolean;
  }) =>
    requestAuth("/api/auth/two-factor/verify-login", { code, rememberDevice }).then(
      applySessionResult,
    ),
  getSession: () => requestAuth("/api/auth/session"),
};

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;

export const signOut = async () => {
  await fetch(apiPath("/api/auth/sign-out"), {
    method: "POST",
    credentials: "include",
  });
  clearSession();
};

const fetchSession = async () => {
  const requestVersion = sessionWriteVersion;
  sessionState = { ...sessionState, status: "loading" };
  notifySessionSubscribers();
  const result = await authClient.getSession();
  if (requestVersion !== sessionWriteVersion) {
    return;
  }
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
    isPending: sessionState.status === "initial" || sessionState.status === "loading",
    refresh: refreshSession,
  };
};

export const useOrganizations = (enabled: boolean) => {
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
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
      setError(loadError instanceof Error ? loadError.message : "Failed to load organizations");
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
