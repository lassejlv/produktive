import { useEffect, useState } from "react";
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

export const useSession = () => {
  const [data, setData] = useState<AuthSession | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      setIsPending(true);
      const result = await authClient.getSession();

      if (!isMounted) {
        return;
      }

      if (result.error) {
        setError(new Error(result.error.message));
        setData(null);
      } else {
        setError(null);
        setData(result.data);
      }

      setIsPending(false);
    };

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  return { data, error, isPending };
};
