import { Link, useParams } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useWorkspaces } from "../lib/queries";
import { useLeafMeta } from "./PageLayout";
import { Button } from "./Button";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { wid } = useParams({ strict: false }) as { wid?: string };
  const ws = useWorkspaces();
  const current = ws.data?.find((w) => w.id === wid || w.slug === wid);
  const widParam = current?.slug ?? wid;
  const meta = useLeafMeta();
  const action = meta.primaryAction;
  const ActionIcon = action?.icon;

  return (
    <div className="sticky top-0 z-10 flex h-[var(--topbar-h)] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 px-3 backdrop-blur-md md:px-5">
      <div className="flex min-w-0 items-center gap-2 text-[13.5px]">
        <button
          type="button"
          onClick={onMenu}
          className="-ml-1 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)] md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={16} />
        </button>
        {widParam && (
          <Link
            to="/$wid"
            params={{ wid: widParam }}
            className="truncate text-[var(--color-fg-muted)] no-underline transition-colors hover:text-[var(--color-fg)]"
          >
            {current?.name ?? "—"}
          </Link>
        )}
        {meta.parent && widParam && (
          <>
            <Crumb />
            <Link
              to={meta.parent.to}
              params={{ wid: widParam }}
              className="truncate text-[var(--color-fg-muted)] no-underline transition-colors hover:text-[var(--color-fg)]"
            >
              {meta.parent.label}
            </Link>
          </>
        )}
        {meta.title && (
          <>
            <Crumb />
            <span className="truncate font-medium tracking-tight text-[var(--color-fg)]">
              {meta.title}
            </span>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        {widParam && action && (
          <Link to={action.to} params={{ wid: widParam }}>
            <Button variant="primary" size="sm">
              {ActionIcon && <ActionIcon size={13} />} {action.label}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function Crumb() {
  return <span className="text-[var(--color-fg-dim)]">/</span>;
}
