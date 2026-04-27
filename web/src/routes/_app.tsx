import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/issues", label: "Issues" },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const session = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!session.isPending && !session.data) {
      void navigate({ to: "/login" });
    }
  }, [navigate, session.data, session.isPending]);

  const currentUser = session.data?.user;

  if (session.isPending || !session.data) {
    return (
      <main className="grid min-h-screen place-items-center text-fg-muted text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" />
          Loading…
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <div className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold text-bg">
              P
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
              Produktive
            </p>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
            Workspace
          </p>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    onClick={() => void navigate({ to: item.to })}
                    className={cn(isActive && "bg-surface text-fg")}
                  >
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface text-[10px] font-medium text-fg">
              {currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-fg">
                {currentUser?.name ?? "User"}
              </p>
              <p className="truncate text-[11px] text-fg-muted">
                {currentUser?.email}
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              await navigate({ to: "/login" });
            }}
          >
            Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
