import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronsUpDown,
  Check,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Rocket,
  ScrollText,
  Settings,
  Shield,
} from "lucide-react";
import { motion } from "motion/react";
import { AnimatedIcon, type IconGesture } from "./AnimatedIcon";
import { Button } from "#/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "./ui/sidebar";
import { cn } from "#/lib/cn";
import { BRAND_NAME } from "#/lib/brand";
import { DEPLOYMENTS_ENABLED, LOGS_ENABLED } from "#/lib/features";
import { auth } from "../lib/api";
import { useMe, useWorkspaces } from "../lib/queries";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  /** Hover gesture for the icon. */
  anim?: IconGesture;
  /** Match only the exact path (e.g. the workspace index), not descendants. */
  exact?: boolean;
}

const UPTIME: NavItem[] = [
  {
    to: "/$wid",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
    anim: "pop",
  },
  { to: "/$wid/monitors", label: "Monitors", icon: Activity, anim: "pulse" },
  {
    to: "/$wid/incidents",
    label: "Incidents",
    icon: ScrollText,
    anim: "wiggle",
  },
  { to: "/$wid/status", label: "Status page", icon: Globe, anim: "spin" },
];

const DEPLOYMENTS: NavItem[] = [
  {
    to: "/$wid/deployments",
    label: "Services",
    icon: Rocket,
    anim: "pop",
  },
];

const LOGGING: NavItem[] = [{ to: "/$wid/logs", label: "Projects", icon: FolderTree, anim: "pop" }];

const SETTINGS: NavItem = {
  to: "/$wid/settings",
  label: "Settings",
  icon: Settings,
  anim: "spin",
};

const ADMIN: NavItem = {
  to: "/$wid/admin",
  label: "Admin",
  icon: Shield,
  anim: "spin",
};

export function AppSidebar() {
  const { wid } = useParams({ strict: false }) as { wid?: string };
  const loc = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const me = useMe();
  const ws = useWorkspaces();
  const [wsOpen, setWsOpen] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const current = ws.data?.find((w) => w.id === wid || w.slug === wid);
  const widParam = current?.slug ?? wid;

  // Close the mobile sheet after navigating.
  const closeOnNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

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
      <Sidebar collapsible="icon" variant="floating">
        <SidebarHeader className="gap-2">
          <div className="flex h-8 items-center px-1">
            <span className="text-[14px] font-semibold tracking-tight text-[var(--color-fg)] group-data-[collapsible=icon]:hidden">
              {BRAND_NAME}
            </span>
          </div>

          <div ref={wsRef} className="relative group-data-[collapsible=icon]:hidden">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setWsOpen((v) => !v)}
              className={cn(
                "h-9 w-full justify-between gap-2 px-2.5 text-left",
                "rounded-[var(--radius-md)] border-[var(--color-border-hi)]",
                "bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]",
                "hover:border-[var(--color-border-strong)]",
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
            </Button>
            {wsOpen && ws.data && (
              <div className="fade-in absolute left-0 right-0 top-11 z-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] py-1 shadow-[var(--shadow-lg)]">
                {ws.data.map((w) => (
                  <Link
                    key={w.id}
                    to="/$wid"
                    params={{ wid: w.slug }}
                    onClick={() => {
                      setWsOpen(false);
                      closeOnNavigate();
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
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Uptime</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {UPTIME.map((it) => (
                  <NavMenuButton
                    key={it.to}
                    item={it}
                    wid={widParam}
                    active={isActive(loc.pathname, it, wid, widParam)}
                    onNavigate={closeOnNavigate}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {DEPLOYMENTS_ENABLED && (
            <SidebarGroup>
              <SidebarGroupLabel>Deployments</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {DEPLOYMENTS.map((it) => (
                    <NavMenuButton
                      key={it.to}
                      item={it}
                      wid={widParam}
                      active={isActive(loc.pathname, it, wid, widParam)}
                      onNavigate={closeOnNavigate}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {LOGS_ENABLED && (
            <SidebarGroup>
              <SidebarGroupLabel>Logging</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {LOGGING.map((it) => (
                    <NavMenuButton
                      key={it.to}
                      item={it}
                      wid={widParam}
                      active={isActive(loc.pathname, it, wid, widParam)}
                      onNavigate={closeOnNavigate}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            {me.data?.is_admin && (
              <NavMenuButton
                item={ADMIN}
                wid={widParam}
                active={isActive(loc.pathname, ADMIN, wid, widParam)}
                onNavigate={closeOnNavigate}
              />
            )}
            <NavMenuButton
              item={SETTINGS}
              wid={widParam}
              active={isActive(loc.pathname, SETTINGS, wid, widParam)}
              onNavigate={closeOnNavigate}
            />
          </SidebarMenu>

          <SidebarSeparator />

          <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col">
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              {(me.data?.email ?? "?")[0]?.toUpperCase()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                auth.clear();
                window.location.href = "/login";
              }}
              className="shrink-0 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]"
              title="Sign out"
            >
              <AnimatedIcon icon={LogOut} animation="slideX" size={13} />
            </Button>
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  );
}

function NavMenuButton({
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
  if (!wid) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={<Link to={item.to} params={{ wid }} onClick={onNavigate} />}
      >
        <motion.span
          initial="rest"
          animate="rest"
          whileHover="hover"
          className="flex w-full items-center gap-2.5"
        >
          <AnimatedIcon
            icon={item.icon}
            animation={item.anim ?? "pop"}
            trigger="group"
            size={16}
            className={active ? "text-[var(--color-accent)]" : "text-[var(--color-fg-dim)]"}
          />
          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
        </motion.span>
      </SidebarMenuButton>
    </SidebarMenuItem>
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
