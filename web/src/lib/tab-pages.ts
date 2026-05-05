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

export const STATIC_PAGES: StaticPage[] = [
  { path: "/workspace", title: "Overview", glyph: "overview" },
  { path: "/issues", title: "Issues", glyph: "issues" },
  { path: "/projects", title: "Projects", glyph: "projects" },
  { path: "/inbox", title: "Inbox", glyph: "inbox" },
  { path: "/notes", title: "Notes", glyph: "notes" },
  { path: "/labels", title: "Labels", glyph: "labels" },
  { path: "/account", title: "Account", glyph: "account" },
  { path: "/workspace/settings", title: "Settings", glyph: "settings" },
];

export function findStaticPage(pathname: string): StaticPage | null {
  return STATIC_PAGES.find((page) => page.path === pathname) ?? null;
}
