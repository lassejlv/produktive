import type { LucideIcon } from "lucide-react";

/**
 * Per-route page metadata. Declared via `staticData` on each file route and
 * consumed in one place each: the shell's PageContent renders the frame
 * (title/description/scroll mode) and the Topbar renders the breadcrumb and
 * primary action. This is the single source of truth for a page's identity —
 * there is no string-matching switch anywhere.
 */
export interface PageMeta {
  /** Breadcrumb leaf + (in "scroll" layout) the page header title. */
  title?: string;
  /** Sub-title shown under the page header in "scroll" layout. */
  description?: string;
  /**
   * How the shell frames this route:
   * - "scroll" (default): managed scroll region + max-width container + PageHeader.
   * - "bare": managed scroll region only; the page owns its own header/width.
   * - "bleed": full-bleed fixed viewport, no scroll/container/header (e.g. canvas).
   */
  layout?: "scroll" | "bare" | "bleed";
  /** A create-style CTA rendered on the right of the Topbar (works in every layout). */
  primaryAction?: { label: string; to: string; icon?: LucideIcon };
  /** Parent crumb inserted between the workspace and this page in the breadcrumb. */
  parent?: { label: string; to: string };
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends PageMeta {}
}
