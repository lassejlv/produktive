import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ChevronsUpDown,
  Check,
  Database,
  Globe,
  LayoutDashboard,
  LogOut,
  Plus,
  ScrollText,
  Settings,
} from "lucide-react";
import { toast } from "#/lib/toast";
import { motion } from "motion/react";
import { AnimatedIcon, type IconGesture } from "./AnimatedIcon";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "./Dialog";
import { Input } from "./Input";
import { Spinner } from "#/components/ui/spinner";
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
import { auth } from "../lib/api";
import { useCreateWorkspace, useMe, useWorkspaces } from "../lib/queries";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  /** Hover gesture for the icon. */
  anim?: IconGesture;
  /** Match only the exact path (e.g. the workspace index), not descendants. */
  exact?: boolean;
}

const MAIN: NavItem[] = [
  {
    to: "/$wid",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
    anim: "pop",
  },
  { to: "/$wid/monitors", label: "Monitors", icon: Activity, anim: "pulse" },
  { to: "/$wid/logs", label: "Logs", icon: Database, anim: "pop" },
  {
    to: "/$wid/incidents",
    label: "Incidents",
    icon: ScrollText,
    anim: "wiggle",
  },
  { to: "/$wid/status", label: "Status page", icon: Globe, anim: "spin" },
];

const SETTINGS: NavItem = {
  to: "/$wid/settings",
  label: "Settings",
  icon: Settings,
  anim: "spin",
};

export function AppSidebar() {
  const { wid } = useParams({ strict: false }) as { wid?: string };
  const loc = useLocation();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const me = useMe();
  const ws = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const [wsOpen, setWsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const wsRef = useRef<HTMLDivElement>(null);
  const current = ws.data?.find((w) => w.id === wid || w.slug === wid);
  const widParam = current?.slug ?? wid;
  const createsAdditionalWorkspace = (ws.data?.length ?? 0) > 0;

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

  function submitWorkspace(event: FormEvent) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name) {
      toast.error("Workspace name is required");
      return;
    }
    createWorkspace.mutate(
      { name },
      {
        onSuccess: (workspace) => {
          setWorkspaceName("");
          setCreateOpen(false);
          setWsOpen(false);
          setOpenMobile(false);

          if (workspace.checkout_url) {
            toast.success("Workspace created. Redirecting to checkout");
            window.location.assign(workspace.checkout_url);
            return;
          }

          if (workspace.requires_upgrade) {
            toast.success("Workspace created. Upgrade required");
            navigate({
              to: "/$wid/settings/billing",
              params: { wid: workspace.slug },
              search: { checkout: undefined },
            });
            return;
          }

          toast.success("Workspace created");
          navigate({ to: "/$wid", params: { wid: workspace.slug } });
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <>
      <Sidebar collapsible="icon" variant="floating">
        <SidebarHeader className="gap-2">
          <div className="flex h-8 items-center gap-2 px-1">
            <span
              className="pulse-dot inline-block h-2 w-2 shrink-0 rounded-full"
              style={{
                background: "var(--color-accent)",
                boxShadow: "0 0 12px color-mix(in srgb, var(--color-accent) 70%, transparent)",
              }}
            />
            <span className="text-[14px] font-semibold tracking-tight text-[var(--color-fg)] group-data-[collapsible=icon]:hidden">
              Produktive
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
                <div className="my-1 border-t border-[var(--color-border)]" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWsOpen(false);
                    setCreateOpen(true);
                  }}
                  className={cn(
                    "h-8 w-full justify-start px-3 text-[13px]",
                    "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <motion.span
                    initial="rest"
                    animate="rest"
                    whileHover="hover"
                    className="flex w-full items-center gap-2"
                  >
                    <AnimatedIcon
                      icon={Plus}
                      animation="pop"
                      trigger="group"
                      size={12}
                      className="text-[var(--color-accent)]"
                    />
                    <span>New workspace</span>
                  </motion.span>
                </Button>
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Uptime</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {MAIN.map((it) => (
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
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <NavMenuButton
              item={SETTINGS}
              wid={widParam}
              active={isActive(loc.pathname, SETTINGS, wid, widParam)}
              onNavigate={closeOnNavigate}
            />
          </SidebarMenu>

          <SidebarSeparator />

          <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col">
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
              <span className="truncate text-[12px] text-[var(--color-fg-muted)] group-data-[collapsible=icon]:hidden">
                {me.data?.email ?? "—"}
              </span>
            </div>
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

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!next && createWorkspace.isPending) return;
          if (!next) setWorkspaceName("");
          setCreateOpen(next);
        }}
      >
        <DialogContent
          title="New workspace"
          description={
            createsAdditionalWorkspace
              ? "Additional workspaces require Usage-based when billing is enabled. After creation, you will be sent to checkout and access stays restricted until the upgrade completes."
              : "Create a separate workspace for another product, team, or status page."
          }
          footer={
            <>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={createWorkspace.isPending}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                form="create-workspace-form"
                variant="default"
                size="sm"
                disabled={createWorkspace.isPending}
              >
                {createWorkspace.isPending && <Spinner className="size-3" />}
                Create workspace
              </Button>
            </>
          }
        >
          <form
            id="create-workspace-form"
            onSubmit={submitWorkspace}
            className="flex flex-col gap-4"
          >
            <Input
              label="Workspace name"
              placeholder="Acme status"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              autoFocus
              required
            />
            {createsAdditionalWorkspace && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2 text-[12px] leading-5 text-[var(--color-fg-muted)]">
                This workspace will be locked behind Usage-based until checkout completes.
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
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
