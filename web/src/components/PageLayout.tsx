import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Outlet, useMatches } from "@tanstack/react-router";
import type { PageMeta } from "../lib/pageMeta";

/** Static metadata of the currently-matched leaf route. */
export function useLeafMeta(): PageMeta {
  const matches = useMatches();
  return (matches[matches.length - 1]?.staticData ?? {}) as PageMeta;
}

/**
 * Lets a page inject controls into the right side of the shell's PageHeader
 * (e.g. filter pills, a mode toggle) without the chrome knowing about the page.
 * No-ops outside "scroll" layout, where there is no header to host them.
 */
const PageChromeContext = createContext<{
  actionsEl: HTMLElement | null;
  setActionsEl: (el: HTMLElement | null) => void;
}>({ actionsEl: null, setActionsEl: () => {} });

export function PageActions({ children }: { children: ReactNode }) {
  const { actionsEl } = useContext(PageChromeContext);
  if (!actionsEl) return null;
  return createPortal(children, actionsEl);
}

/**
 * Shared pending state, wired as the router's `defaultPendingComponent`. It
 * renders inside whatever frame PageContent already established for the route
 * (the frame is driven by static metadata, available before the loader
 * resolves), so the skeleton appears with the correct width and header.
 */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="shimmer h-24 rounded-[var(--radius-lg)]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer h-20 rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="shimmer h-40 rounded-[var(--radius-lg)]" />
    </div>
  );
}

function PageHeader({ title, description }: { title?: string; description?: string }) {
  const { setActionsEl } = useContext(PageChromeContext);
  return (
    <div className="mb-7 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {title && (
          <h1 className="mb-1.5 text-[22px] font-medium tracking-tight text-[var(--color-fg)]">
            {title}
          </h1>
        )}
        {description && <p className="text-[13.5px] text-[var(--color-fg-muted)]">{description}</p>}
      </div>
      <div ref={setActionsEl} className="flex shrink-0 items-center gap-2" />
    </div>
  );
}

/**
 * The shell-owned page frame. Reads the leaf route's `staticData` and renders
 * one of three layouts so individual routes never re-implement the scroll
 * region, content width, or page header:
 * - "scroll" (default): scroll region + max-width container + PageHeader.
 * - "bare": scroll region only; the page owns its inner header/width.
 * - "bleed": full-bleed fixed viewport (e.g. the monitor canvas).
 */
export function PageContent() {
  const meta = useLeafMeta();
  const layout = meta.layout ?? "scroll";
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);

  if (layout === "bleed") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    );
  }

  if (layout === "bare") {
    // A plain block scroll container — the page owns its own width/centering
    // (e.g. `mx-auto max-w-5xl`). Not a flex column: an `mx-auto` flex child
    // collapses to its content width instead of filling.
    return (
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    );
  }

  return (
    <PageChromeContext.Provider value={{ actionsEl, setActionsEl }}>
      <main className="flex-1 overflow-y-auto">
        <div className="fade-in mx-auto flex min-h-full w-full max-w-[var(--layout-content-max)] flex-col px-[var(--layout-gutter)] py-8">
          {(meta.title || meta.description) && (
            <PageHeader title={meta.title} description={meta.description} />
          )}
          <Outlet />
        </div>
      </main>
    </PageChromeContext.Provider>
  );
}
