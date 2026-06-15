import { useEffect, useState } from "react";
import { cn } from "#/lib/cn";
import type { StatusStyle } from "../../lib/types";

interface Props {
  title: string;
  style: StatusStyle;
  generatedAt?: string;
  /** Browser tab title, e.g. "Acme — All systems operational". */
  documentTitle?: string;
  /** Rendered inside the editor (no fixed min-height). */
  preview?: boolean;
  children: React.ReactNode;
}

/**
 * Shared chrome for every public status surface (the status page and the
 * incident-history page): theme/accent wrapper, logo header, and footer.
 */
export function StatusShell({
  title,
  style,
  generatedAt,
  documentTitle,
  preview,
  children,
}: Props) {
  const effTheme = useEffectiveTheme(style.theme);

  // The SPA ships one global <title>; public pages override it so tabs and
  // history entries read as the customer's page, not as Produktive.
  useEffect(() => {
    if (preview || !documentTitle) return;
    document.title = documentTitle;
  }, [documentTitle, preview]);

  // Brand accent recolors links/accents only — never status semantics. A rose
  // accent must not turn "Operational" indicators red.
  const accentVars = style.accent
    ? ({ "--color-accent": style.accent, "--color-link": style.accent } as React.CSSProperties)
    : undefined;

  return (
    <div
      data-theme={effTheme}
      style={accentVars}
      className={cn(
        "bg-[var(--color-bg)] text-[var(--color-fg)]",
        preview ? "min-h-full" : "min-h-screen",
      )}
    >
      <div className="mx-auto max-w-[680px] px-6">
        {/* header */}
        <header className="flex h-14 items-center justify-between">
          {style.header_link ? (
            <a
              href={style.header_link}
              className="flex min-w-0 items-center no-underline"
              rel="noopener noreferrer"
            >
              {style.logo_url ? (
                <img
                  src={style.logo_url}
                  alt={title}
                  className="max-h-7 max-w-[160px] object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-[13px] font-semibold tracking-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                  {title}
                </span>
              )}
            </a>
          ) : style.logo_url ? (
            <img
              src={style.logo_url}
              alt={title}
              className="max-h-7 max-w-[160px] object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-[13px] font-semibold tracking-tight text-[var(--color-fg-muted)]">
              Produktive
            </span>
          )}
          {generatedAt && (
            <span className="tabular text-[11px] text-[var(--color-fg-dim)]">
              Updated {timeAgo(generatedAt)}
            </span>
          )}
        </header>

        {children}

        {/* footer */}
        <footer className="mt-4 py-12 text-center">
          <a
            href="https://unstatus.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 text-[11px] tracking-tight text-[var(--color-fg-dim)] no-underline shadow-[var(--shadow-xs)] transition-colors hover:text-[var(--color-fg-muted)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            Powered by Produktive
          </a>
        </footer>
      </div>
    </div>
  );
}

function useEffectiveTheme(theme: StatusStyle["theme"]): "light" | "dark" {
  const [sys, setSys] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    if (theme !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSys(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return theme === "auto" ? sys : theme;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
