export type StaticPageGlyph =
  | "overview"
  | "issues"
  | "projects"
  | "inbox"
  | "notes"
  | "labels"
  | "account"
  | "settings";

export type StaticPage = {
  path: string;
  title: string;
  glyph: StaticPageGlyph;
};

/**
 * Paths are workspace-relative (without the workspace slug prefix).
 * The dashboard sits at the root ("/") under the active workspace.
 */
export const STATIC_PAGES: StaticPage[] = [
  { path: "/", title: "Overview", glyph: "overview" },
  { path: "/issues", title: "Issues", glyph: "issues" },
  { path: "/projects", title: "Projects", glyph: "projects" },
  { path: "/inbox", title: "Inbox", glyph: "inbox" },
  { path: "/notes", title: "Notes", glyph: "notes" },
  { path: "/labels", title: "Labels", glyph: "labels" },
  { path: "/account", title: "Account", glyph: "account" },
  { path: "/settings", title: "Settings", glyph: "settings" },
];

/**
 * Strips the workspace slug from a pathname to produce the workspace-relative
 * sub-path that STATIC_PAGES is keyed on.
 */
export function workspaceSubpath(pathname: string, workspaceSlug: string): string {
  if (!workspaceSlug) return pathname;
  const prefix = `/${workspaceSlug}`;
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || "/";
  return pathname;
}

export function findStaticPage(pathname: string, workspaceSlug?: string): StaticPage | null {
  const target = workspaceSlug ? workspaceSubpath(pathname, workspaceSlug) : pathname;
  return STATIC_PAGES.find((page) => page.path === target) ?? null;
}
