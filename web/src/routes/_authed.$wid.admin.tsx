import { createFileRoute, Link, Outlet, redirect, useLocation, useParams } from "@tanstack/react-router";
import { cn } from "#/lib/cn";
import { LOGS_ENABLED } from "#/lib/features";
import { meQuery } from "../lib/queries";

export const Route = createFileRoute("/_authed/$wid/admin")({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me.is_admin) {
      throw redirect({ to: "/$wid", params: { wid: params.wid } });
    }
  },
  component: AdminLayout,
});

interface AdminTab {
  to: string;
  label: string;
  /** Match only the exact path (an index), not descendants. */
  exact?: boolean;
}

const TABS: AdminTab[] = [
  { to: "/$wid/admin/workers", label: "Workers" },
  { to: "/$wid/admin/log-storage", label: "Log storage" },
  { to: "/$wid/admin/log-access", label: "Log access" },
  { to: "/$wid/admin/usage", label: "Usage" },
];

function AdminLayout() {
  const { wid } = useParams({ from: "/_authed/$wid" });
  const loc = useLocation();
  const tabs = TABS.filter((t) => {
    if (!LOGS_ENABLED && t.to.endsWith("/log-storage")) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-1 flex items-center gap-1 border-b border-[var(--color-border)]">
        {tabs.map((tab) => {
          const resolved = tab.to.replace("$wid", wid);
          const active = tab.exact
            ? loc.pathname === resolved || loc.pathname === resolved + "/"
            : loc.pathname === resolved || loc.pathname.startsWith(resolved + "/");
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ wid }}
              className={cn(
                "relative -mb-px flex h-9 items-center px-3 text-[13px] font-medium no-underline transition-colors",
                active
                  ? "text-[var(--color-fg)]"
                  : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              {tab.label}
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-[var(--color-accent)]" />
              )}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
