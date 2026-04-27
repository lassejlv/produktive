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
      <Sidebar className="w-[248px] bg-sidebar">
        <SidebarHeader>
          <div className="flex items-center gap-[9px]">
            <div className="grid size-[22px] place-items-center rounded-[5px] bg-fg text-[10.5px] font-semibold text-bg">
              P
            </div>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.005em] text-fg">
              Produktive
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-3.5 p-2.5">
          <div>
            <button
              type="button"
              onClick={() => void navigate({ to: "/chat" })}
              className={cn(
                "mb-1.5 inline-flex h-8 w-full items-center gap-2 rounded-[7px] border border-border px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-[#33333a] hover:bg-surface-2",
                isNewChatActive ? "bg-surface-2" : "bg-surface",
              )}
            >
              <PlusIcon />
              <span>New chat</span>
              <span className="ml-auto rounded border border-border bg-bg px-[5px] py-px font-mono text-[10px] text-fg-faint">
                ⌘ K
              </span>
            </button>
          </div>

          <div>
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Workspace
            </div>
            <div className="flex flex-col gap-px">
              <button
                type="button"
                onClick={() => void navigate({ to: "/issues" })}
                className={cn(
                  "flex h-[30px] w-full items-center gap-[9px] rounded-md px-[9px] text-left text-[13px] transition-colors",
                  isIssuesActive
                    ? "bg-surface text-fg [&_svg]:text-fg-muted"
                    : "text-fg-muted hover:bg-surface hover:text-fg [&_svg]:text-fg-faint",
                )}
              >
                <IssuesIcon />
                <span className="flex-1 truncate">Issues</span>
              </button>
            </div>
          </div>

          <div>
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Recent
            </div>
            <div className="flex flex-col gap-px">
              {chatsLoading ? (
                <div className="px-[9px] py-1 text-[12px] text-fg-faint">
                  Loading…
                </div>
              ) : chats.length === 0 ? (
                <div className="px-[9px] py-1 text-[12px] text-fg-faint">
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
                        "group flex h-7 w-full items-center gap-2 rounded-md px-[9px] text-left text-[12.5px] transition-colors",
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
