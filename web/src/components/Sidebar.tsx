import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronsUpDown,
  Globe,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Check,
} from "lucide-react";
import { cn } from "#/lib/cn";
import { auth } from "../lib/api";
import { useMe, useWorkspaces } from "../lib/queries";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  /** Match only the exact path (e.g. the workspace index), not descendants. */
  exact?: boolean;
}

const MAIN: NavItem[] = [
  { to: "/$wid", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/$wid/monitors", label: "Monitors", icon: Activity },
  { to: "/$wid/incidents", label: "Incidents", icon: ScrollText },
  { to: "/$wid/status", label: "Status page", icon: Globe },
];

const SETTINGS: NavItem = { to: "/$wid/settings", label: "Settings", icon: Settings };

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wid } = useParams({ strict: false }) as { wid?: string };
  const loc = useLocation();
  const me = useMe();
  const ws = useWorkspaces();
  const [wsOpen, setWsOpen] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const current = ws.data?.find((w) => w.id === wid || w.slug === wid);
  const widParam = current?.slug ?? wid;

  useEffect(() => {
    if (!wsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!wsRef.current?.contains(e.target as Node)) setWsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [wsOpen]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "z-40 flex h-full w-[var(--sidebar-w)] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-sunken)]",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-[var(--shadow-lg)] max-md:transition-transform max-md:duration-200",
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className="flex h-[var(--topbar-h)] items-center px-4">
          <div className="flex items-center gap-2">
            <span
              className="pulse-dot inline-block h-2 w-2 rounded-full"
              style={{
                background: "var(--color-accent)",
                boxShadow: "0 0 12px color-mix(in srgb, var(--color-accent) 70%, transparent)",
              }}
            />
            <span className="text-[14px] font-semibold tracking-tight text-[var(--color-fg)]">
              unstatus
            </span>
          </div>
        </div>

        <div ref={wsRef} className="relative px-2 pb-2">
          <button
            onClick={() => setWsOpen((v) => !v)}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 px-2.5 text-left",
              "rounded-[var(--radius-md)] border border-[var(--color-border-hi)]",
              "bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]",
              "transition-colors hover:border-[var(--color-border-strong)]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2 truncate text-[13px]">
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[10px] font-semibold"
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                }}
              >
                {(current?.name ?? "?")[0]?.toUpperCase()}
              </span>
              <span className="truncate text-[var(--color-fg)]">{current?.name ?? "—"}</span>
            </span>
            <ChevronsUpDown size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
          </button>
          {wsOpen && ws.data && (
            <div className="fade-in absolute left-2 right-2 top-11 z-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] py-1 shadow-[var(--shadow-lg)]">
              {ws.data.map((w) => (
                <Link
                  key={w.id}
                  to="/$wid"
                  params={{ wid: w.slug }}
                  onClick={() => {
                    setWsOpen(false);
                    onClose();
                  }}
                  className={cn(
                    "flex h-8 items-center justify-between truncate px-3 text-[13px] no-underline",
                    w.id === current?.id
                      ? "bg-[var(--color-bg-row)] text-[var(--color-fg)]"
                      : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {w.name}
                    {w.is_personal && (
                      <span className="text-[11px] text-[var(--color-fg-dim)]">personal</span>
                    )}
                  </span>
                  {w.id === current?.id && (
                    <Check size={12} className="shrink-0 text-[var(--color-accent)]" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-2 text-[13px]">
          <SectionLabel>Workspace</SectionLabel>
          {MAIN.map((it) => (
            <NavLink
              key={it.to}
              item={it}
              wid={widParam}
              active={isActive(loc.pathname, it, wid, widParam)}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] px-2 py-2 text-[13px]">
          <NavLink
            item={SETTINGS}
            wid={widParam}
            active={isActive(loc.pathname, SETTINGS, wid, widParam)}
            onNavigate={onClose}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-2.5 text-[13px]">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              {(me.data?.email ?? "?")[0]?.toUpperCase()}
            </span>
            <span className="truncate text-[12px] text-[var(--color-fg-muted)]">
              {me.data?.email ?? "—"}
            </span>
          </div>
          <button
            onClick={() => {
              auth.clear();
              window.location.href = "/login";
            }}
            className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]"
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-1 mt-4 px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
      {children}
    </div>
  );
}

function NavLink({
  item,
  wid,
  active,
  onNavigate,
}: {
  item: NavItem;
  wid: string | undefined;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  if (!wid) return null;
  return (
    <Link
      to={item.to}
      params={{ wid }}
      onClick={onNavigate}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 no-underline transition-colors",
        active
          ? "border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
          : "border border-transparent text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]",
      )}
    >
      <Icon
        size={14}
        className={cn(
          "shrink-0",
          active ? "text-[var(--color-accent)]" : "text-[var(--color-fg-dim)]",
        )}
      />
      <span>{item.label}</span>
    </Link>
  );
}

function isActive(
  pathname: string,
  item: NavItem,
  currentWid: string | undefined,
  canonicalWid: string | undefined,
): boolean {
  const candidates = [currentWid, canonicalWid].filter(Boolean) as string[];
  return candidates.some((wid) => {
    const resolved = item.to.replace("$wid", wid);
    if (item.exact) return pathname === resolved || pathname === resolved + "/";
    return pathname === resolved || pathname.startsWith(resolved + "/");
  });
}
