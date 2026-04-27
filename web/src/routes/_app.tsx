import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import {
  DotsIcon,
  IssuesIcon,
  PlusIcon,
} from "@/components/chat/icons";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { signOut, useSession } from "@/lib/auth-client";
import { useChats } from "@/lib/use-chats";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const session = useSession();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { chats, isLoading: chatsLoading } = useChats();

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

  const isNewChatActive = pathname === "/chat";
  const isIssuesActive = pathname === "/issues" || pathname.startsWith("/issues/");

  return (
    <SidebarProvider>
      <Sidebar className="bg-sidebar/95">
        <SidebarHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-7 place-items-center rounded-[8px] bg-fg text-[13px] font-semibold text-bg shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_22px_rgba(0,0,0,0.35)]">
              P
            </div>
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.02em] text-fg">
              Produktive
            </span>
            <button
              type="button"
              aria-label="Open workspace"
              className="grid size-8 place-items-center rounded-[9px] border border-border bg-surface/70 text-fg-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#33333a] hover:bg-surface-2 hover:text-fg"
            >
              <DotsIcon />
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-7 px-6 py-0">
          <div>
            <button
              type="button"
              onClick={() => void navigate({ to: "/chat" })}
              className={cn(
                "inline-flex h-11 w-full items-center gap-3 rounded-[10px] border border-border px-4 text-[15px] font-medium text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors hover:border-[#33333a] hover:bg-surface-2",
                isNewChatActive ? "bg-surface-2" : "bg-surface/50",
              )}
            >
              <PlusIcon />
              <span>New chat</span>
              <span className="ml-auto rounded-[6px] border border-border bg-surface-3 px-2 py-1 font-mono text-[11px] text-fg-muted">
                ⌘ K
              </span>
            </button>
          </div>

          <div>
            <div className="px-2 pb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Workspace
            </div>
            <div className="flex flex-col gap-px">
              <button
                type="button"
                onClick={() => void navigate({ to: "/issues" })}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-[8px] px-3 text-left text-[15px] transition-colors",
                  isIssuesActive
                    ? "bg-surface-2 text-fg [&_svg]:text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg [&_svg]:text-fg-faint",
                )}
              >
                <IssuesIcon />
                <span className="flex-1 truncate">Issues</span>
              </button>
            </div>
          </div>

          <div>
            <div className="px-2 pb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Recent
            </div>
            <div className="flex flex-col gap-px">
              {chatsLoading ? (
                <div className="px-3 py-1 text-[14px] text-fg-faint">
                  Loading…
                </div>
              ) : chats.length === 0 ? (
                <div className="px-3 py-1 text-[14px] text-fg-faint">
                  No chats yet
                </div>
              ) : (
                chats.map((entry) => {
                  const isActive = pathname === `/chat/${entry.id}`;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() =>
                        void navigate({
                          to: "/chat/$chatId",
                          params: { chatId: entry.id },
                        })
                      }
                      className={cn(
                        "group flex h-9 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[14px] transition-colors",
                        isActive
                          ? "bg-surface text-fg"
                          : "text-fg-muted hover:bg-surface hover:text-fg",
                      )}
                    >
                      <span className="flex-1 truncate">{entry.title}</span>
                      <span className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg">
                        <DotsIcon />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-[14px] font-medium text-fg">
              {currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-fg">
                {currentUser?.name ?? "User"}
              </p>
              <p className="truncate text-[12px] text-fg-muted">
                {currentUser?.email}
              </p>
            </div>
            <span className="text-fg-muted">
              <DotsIcon />
            </span>
          </div>
          <Button
            className="mt-6 h-11 w-full rounded-[8px] text-[14px]"
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
