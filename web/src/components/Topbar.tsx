import { Link, useParams } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useWorkspaces } from "../lib/queries";
import { useLeafMeta } from "./PageLayout";
import { AnimatedIcon } from "./AnimatedIcon";
import { Button } from "#/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { SidebarTrigger } from "./ui/sidebar";

export function Topbar() {
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
        <SidebarTrigger className="-ml-1 text-[var(--color-fg-muted)]" />
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
            <Button variant="default" size="sm">
              <motion.span
                initial="rest"
                animate="rest"
                whileHover="hover"
                className="inline-flex items-center gap-1.5"
              >
                {ActionIcon && (
                  <AnimatedIcon icon={ActionIcon} animation="pop" trigger="group" size={13} />
                )}
                {action.label}
              </motion.span>
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
