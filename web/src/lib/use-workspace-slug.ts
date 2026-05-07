import { useSession } from "@/lib/auth-client";

/**
 * The current workspace slug — read from the active session organization.
 * Returns an empty string before the session loads. Components that render
 * inside the `_app` layout can rely on it being a non-empty string.
 */
export function useWorkspaceSlug(): string {
  const session = useSession();
  return session.data?.organization.slug ?? "";
}
