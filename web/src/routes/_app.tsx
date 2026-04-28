import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CaretIcon,
  DotsIcon,
  IssuesIcon,
  SparkleIcon,
  StarIcon,
} from "@/components/chat/icons";
import { StatusIcon } from "@/components/issue/status-icon";
import { OrgSwitcher } from "@/components/org-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { deleteChat, getChat, type Chat } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { parseMessageWithAttachments } from "@/lib/chat-attachments";
import { useChats } from "@/lib/use-chats";
import { useFavorites } from "@/lib/use-favorites";
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
  const { chats, isLoading: chatsLoading, removeChat } = useChats();
  const {
    favorites,
    isLoading: favoritesLoading,
    isFavorite,
    toggleFavorite,
  } = useFavorites();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [chatMenuOpenId, setChatMenuOpenId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!chatMenuOpenId) return;

    const handlePointerDown = () => setChatMenuOpenId(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChatMenuOpenId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [chatMenuOpenId]);

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

  const isIssuesActive =
    pathname === "/issues" || pathname.startsWith("/issues/");
  const isNewChatActive = pathname === "/chat";
  const recentChats = chats.slice(0, 8);

  const openChat = async (id: string) => {
    setChatMenuOpenId(null);
    await navigate({
      to: "/chat/$chatId",
      params: { chatId: id },
    });
  };

  const copyChatLink = async (id: string) => {
    setChatMenuOpenId(null);
    const url = new URL(`/chat/${id}`, window.location.origin);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Chat link copied");
    } catch {
      toast.error("Failed to copy chat link");
    }
  };

  const exportChat = async (chat: Chat) => {
    setChatMenuOpenId(null);
    try {
      const data = await getChat(chat.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(displayChatTitle(chat))}-${chat.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Chat exported");
    } catch {
      toast.error("Failed to export chat");
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    setChatMenuOpenId(null);
    try {
      await deleteChat(chat.id);
      removeChat(chat.id);
      if (pathname === `/chat/${chat.id}`) {
        await navigate({ to: "/chat" });
      }
      toast.success("Chat deleted");
    } catch {
      toast.error("Failed to delete chat");
    }
  };

  return (
    <SidebarProvider>
      <Sidebar className="bg-sidebar/95">
        <SidebarHeader>
          <OrgSwitcher activeOrganization={session.data.organization} />
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-5 px-4 pt-0 pb-3">
          {favoritesLoading || favorites.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                <StarIcon size={10} filled />
                Favorites
              </div>
              <div className="flex flex-col gap-px">
                {favoritesLoading && favorites.length === 0 ? (
                  <div className="px-2.5 py-1 text-[12px] text-fg-faint">
                    Loading…
                  </div>
                ) : (
                  favorites.map((fav) => {
                    const targetPath =
                      fav.type === "chat"
                        ? `/chat/${fav.id}`
                        : `/issues/${fav.id}`;
                    const isActive = pathname === targetPath;
                    const goTo = () =>
                      fav.type === "chat"
                        ? navigate({
                            to: "/chat/$chatId",
                            params: { chatId: fav.id },
                          })
                        : navigate({
                            to: "/issues/$issueId",
                            params: { issueId: fav.id },
                          });
                    return (
                      <button
                        key={fav.favoriteId}
                        type="button"
                        onClick={() => void goTo()}
                        className={cn(
                          "group flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
                          isActive
                            ? "bg-surface text-fg"
                            : "text-fg-muted hover:bg-surface hover:text-fg",
                        )}
                      >
                        <span className="shrink-0 text-fg-faint group-hover:text-fg-muted">
                          {fav.type === "issue" ? (
                            <StatusIcon status={fav.status} />
                          ) : (
                            <SparkleIcon size={11} />
                          )}
                        </span>
                        <span className="flex-1 truncate">
                          {displayFavoriteTitle(fav.title)}
                        </span>
                        <span
                          className="shrink-0 text-warning opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg"
                          role="button"
                          tabIndex={0}
                          aria-label={`Unpin ${displayFavoriteTitle(fav.title)}`}
                          onClick={async (event) => {
                            event.stopPropagation();
                            try {
                              await toggleFavorite(fav.type, fav.id);
                              toast.success("Removed from favorites");
                            } catch {
                              toast.error("Failed to update favorite");
                            }
                          }}
                          onKeyDown={async (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              try {
                                await toggleFavorite(fav.type, fav.id);
                                toast.success("Removed from favorites");
                              } catch {
                                toast.error("Failed to update favorite");
                              }
                            }
                          }}
                        >
                          <StarIcon size={11} filled />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

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
                recentChats.map((entry) => {
                  const isActive = pathname === `/chat/${entry.id}`;
                  return (
                    <div key={entry.id} className="relative">
                      <button
                        type="button"
                        onClick={() => void openChat(entry.id)}
                        className={cn(
                          "group flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
                          isActive
                            ? "bg-surface text-fg"
                            : "text-fg-muted hover:bg-surface hover:text-fg",
                        )}
                      >
                        <span className="flex-1 truncate">
                          {displayChatTitle(entry)}
                        </span>
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg",
                            chatMenuOpenId === entry.id
                              ? "bg-surface-2 opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                          role="button"
                          tabIndex={0}
                          aria-label={`Actions for ${displayChatTitle(entry)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setChatMenuOpenId((current) =>
                              current === entry.id ? null : entry.id,
                            );
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              setChatMenuOpenId((current) =>
                                current === entry.id ? null : entry.id,
                              );
                            }
                          }}
                        >
                          <DotsIcon />
                        </span>
                      </button>
                      {chatMenuOpenId === entry.id ? (
                        <div
                          className="absolute right-1 top-8 z-30 w-36 overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-xl"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <ChatMenuItem onClick={() => void openChat(entry.id)}>
                            Open
                          </ChatMenuItem>
                          <ChatMenuItem
                            onClick={async () => {
                              setChatMenuOpenId(null);
                              const wasFavorite = isFavorite("chat", entry.id);
                              try {
                                await toggleFavorite("chat", entry.id);
                                toast.success(
                                  wasFavorite
                                    ? "Removed from favorites"
                                    : "Pinned to sidebar",
                                );
                              } catch {
                                toast.error("Failed to update favorite");
                              }
                            }}
                          >
                            {isFavorite("chat", entry.id) ? "Unpin" : "Pin"}
                          </ChatMenuItem>
                          <ChatMenuItem
                            onClick={() => void exportChat(entry)}
                          >
                            Export JSON
                          </ChatMenuItem>
                          <ChatMenuItem
                            onClick={() => void copyChatLink(entry.id)}
                          >
                            Copy link
                          </ChatMenuItem>
                          <div className="my-1 h-px bg-border-subtle" />
                          <ChatMenuItem
                            danger
                            onClick={() => void handleDeleteChat(entry)}
                          >
                            Delete
                          </ChatMenuItem>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SidebarContent>

        <SidebarFooter className="relative">
          <div ref={accountMenuRef}>
            {accountMenuOpen ? (
              <div className="absolute bottom-[74px] left-4 right-4 overflow-hidden rounded-[9px] border border-border bg-surface animate-fade-up">
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
        <div className="pointer-events-none absolute bottom-2 right-3 z-30 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void navigate({ to: "/chat" })}
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] transition-colors",
              isNewChatActive
                ? "text-accent"
                : "text-fg-muted hover:bg-surface/80 hover:text-fg",
            )}
          >
            <SparkleIcon size={12} />
            <span>Ask Produktive</span>
          </button>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ChatMenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center px-2.5 text-left text-[12px] transition-colors hover:bg-surface-2",
        danger ? "text-danger" : "text-fg",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function displayChatTitle(chat: Chat) {
  return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
}

function displayFavoriteTitle(title: string) {
  return parseMessageWithAttachments(title).text.trim() || "Untitled";
}

function safeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "chat";
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
