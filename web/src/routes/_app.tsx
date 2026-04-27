import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  CaretIcon,
  DotsIcon,
  IssuesIcon,
  PlusIcon,
} from "@/components/chat/icons";
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!session.isPending && !session.data) {
      void navigate({ to: "/login" });
    }
  }, [navigate, session.data, session.isPending]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

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
          <div className="flex items-center gap-2.5">
            <div className="grid size-6 place-items-center rounded-[7px] bg-fg text-[12px] font-semibold text-bg">
              P
            </div>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.015em] text-fg">
              Produktive
            </span>
            <button
              type="button"
              aria-label="Open workspace"
              className="grid size-7 place-items-center rounded-[8px] border border-border bg-surface/50 text-fg-muted transition-colors hover:border-[#33333a] hover:bg-surface-2 hover:text-fg"
            >
              <DotsIcon />
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-5 px-4 py-0">
          <div>
            <button
              type="button"
              onClick={() => void navigate({ to: "/chat" })}
              className={cn(
                "inline-flex h-9 w-full items-center gap-2.5 rounded-[8px] border border-border px-3 text-[13px] font-medium text-fg transition-colors hover:border-[#33333a] hover:bg-surface-2",
                isNewChatActive ? "bg-surface-2" : "bg-surface/50",
              )}
            >
              <PlusIcon />
              <span>New chat</span>
              <span className="ml-auto rounded-[5px] border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                ⌘ K
              </span>
            </button>
          </div>

          <div>
            <div className="px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Workspace
            </div>
            <div className="flex flex-col gap-px">
              <button
                type="button"
                onClick={() => void navigate({ to: "/issues" })}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
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
            <div className="px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Recent
            </div>
            <div className="flex flex-col gap-px">
              {chatsLoading ? (
                <div className="px-2.5 py-1 text-[12px] text-fg-faint">
                  Loading…
                </div>
              ) : chats.length === 0 ? (
                <div className="px-2.5 py-1 text-[12px] text-fg-faint">
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
                        "group flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
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

        <SidebarFooter className="relative">
          <div ref={accountMenuRef}>
            {accountMenuOpen ? (
              <div className="absolute bottom-[74px] left-4 right-4 overflow-hidden rounded-[9px] border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.22)] animate-fade-up">
                <div className="border-b border-border-subtle px-3 py-2.5">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {currentUser?.name ?? "User"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                    {currentUser?.email}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between px-3 text-left text-[13px] font-medium text-fg transition-colors hover:bg-surface-2"
                  onClick={async () => {
                    setAccountMenuOpen(false);
                    await signOut();
                    await navigate({ to: "/login" });
                  }}
                >
                  <span>Sign out</span>
                  <span className="text-fg-faint">
                    <SignOutIcon />
                  </span>
                </button>
              </div>
            ) : null}

            <button
              type="button"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[9px] border border-transparent p-1.5 text-left transition-colors",
                accountMenuOpen
                  ? "border-border bg-surface"
                  : "hover:border-border hover:bg-surface/65",
              )}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-border bg-surface text-[12px] font-medium text-fg">
                {currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">
                  {currentUser?.name ?? "User"}
                </p>
                <p className="truncate text-[11px] text-fg-muted">
                  {currentUser?.email}
                </p>
              </div>
              <span
                className={cn(
                  "text-fg-muted transition-transform",
                  accountMenuOpen && "rotate-180",
                )}
              >
                <CaretIcon />
              </span>
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

function SignOutIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
