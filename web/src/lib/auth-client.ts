import { createAuthClient } from "better-auth/react";
import { apiUrl } from "./api";

export const authClient = createAuthClient({
  baseURL: apiUrl,
});

export const { signIn, signUp, signOut, useSession } = authClient;
