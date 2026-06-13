/** Path + search saved when sending users to login (internal app URLs only). */
export function authRedirectTarget(location: { pathname: string; searchStr?: string }): string {
  const search = location.searchStr ?? "";
  return `${location.pathname}${search}`;
}

/**
 * Sanitize post-login redirect from search params.
 * Rejects external URLs, protocol-relative paths, and auth loops.
 */
export function parseLoginRedirect(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  const path = raw.split("?")[0]?.split("#")[0] ?? raw;
  if (path === "/login" || path.startsWith("/login/")) return "/";
  if (path === "/signup" || path.startsWith("/signup/")) return "/";
  return raw;
}
