import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { cn } from "#/lib/cn";

export const Route = createFileRoute("/_authed/$wid/settings")({
  component: SettingsLayout,
});

interface SettingsTab {
  to: string;
  label: string;
  /** Match only the exact path (the General index), not descendants. */
  exact?: boolean;
}

const TABS: SettingsTab[] = [
  { to: "/$wid/settings", label: "General", exact: true },
  { to: "/$wid/settings/members", label: "Members" },
  { to: "/$wid/settings/notifications", label: "Notifications" },
  { to: "/$wid/settings/usage", label: "Usage" },
];

function SettingsLayout() {
  const { wid } = useParams({ from: "/_authed/$wid" });
  const loc = useLocation();

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-1 flex items-center gap-1 border-b border-[var(--color-border)]">
        {TABS.map((tab) => {
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
