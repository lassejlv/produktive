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
import { CommandPalette } from "@/components/command-palette";
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
import { LoadingTip } from "@/components/ui/loading-tip";
import { deleteChat, getChat, type Chat } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { parseMessageWithAttachments } from "@/lib/chat-attachments";
import { useChats } from "@/lib/use-chats";
import { useFavorites } from "@/lib/use-favorites";
import { useInbox } from "@/lib/use-inbox";
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
  const { unreadCount: inboxUnread } = useInbox();
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
      <main className="grid min-h-screen place-items-center px-6">
        <div className="bg-dotgrid" aria-hidden />
        <LoadingTip />
      </main>
    );
  }

  const isIssuesActive =
    pathname === "/issues" || pathname.startsWith("/issues/");
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
      <CommandPalette />
      <Sidebar className="bg-sidebar/95">
        <SidebarHeader>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <OrgSwitcher activeOrganization={session.data.organization} />
            </div>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("produktive:open-cmdk"),
                )
              }
              aria-label="Search"
              className="grid size-7 shrink-0 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
            >
              <SearchSidebarIcon />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  pathname !== "/issues" &&
                  !pathname.startsWith("/issues/")
                ) {
                  await navigate({ to: "/issues" });
                }
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("produktive:new-issue"),
                  );
                }, 50);
              }}
              aria-label="New issue"
              className="grid size-7 shrink-0 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
            >
              <ComposeIcon />
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-5 px-4 pt-0 pb-3">
          <div className="flex flex-col gap-px">
            <button
              type="button"
              onClick={() => void navigate({ to: "/inbox" })}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
                pathname === "/inbox"
                  ? "bg-surface-2 text-fg [&_svg]:text-fg"
                  : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              <InboxIcon />
              <span className="flex-1 truncate">Inbox</span>
              {inboxUnread > 0 ? (
                <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white">
                  {inboxUnread > 99 ? "99+" : inboxUnread}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  pathname !== "/issues" &&
                  !pathname.startsWith("/issues/")
                ) {
                  await navigate({ to: "/issues" });
                }
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("produktive:filter-mine", {
                      detail: { userId: currentUser?.id ?? null },
                    }),
                  );
                }, 50);
              }}
              className="flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface hover:text-fg [&_svg]:text-fg-faint"
            >
              <MyIssuesIcon />
              <span className="flex-1 truncate">My issues</span>
            </button>
          </div>

          {favoritesLoading || favorites.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                <StarIcon size={10} filled />
                Favorites
              </div>
              <div className="flex flex-col gap-px">
                {favoritesLoading && favorites.length === 0 ? (
                  <div className="px-2.5 py-1">
                    <LoadingTip compact />
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
              <button
                type="button"
                onClick={() => toast("Views coming soon")}
                className="flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface hover:text-fg [&_svg]:text-fg-faint"
              >
                <ViewsIcon />
                <span className="flex-1 truncate">Views</span>
              </button>
              <button
                type="button"
                onClick={() => toast("Projects coming soon")}
                className="flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface hover:text-fg [&_svg]:text-fg-faint"
              >
                <ProjectsIcon />
                <span className="flex-1 truncate">Projects</span>
              </button>
              <button
                type="button"
                onClick={() => void navigate({ to: "/members" })}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
                  pathname === "/members"
                    ? "bg-surface-2 text-fg [&_svg]:text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <MembersIcon />
                <span className="flex-1 truncate">Members</span>
              </button>
            </div>
          </div>

          <TrySection />

          <div>
            <div className="px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Recent
            </div>
            <div className="flex flex-col gap-px">
              {chatsLoading ? (
                <div className="px-2.5 py-1">
                  <LoadingTip compact />
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
                  className="flex h-9 w-full items-center justify-between px-3 text-left text-[13px] text-fg transition-colors hover:bg-surface-2"
                  onClick={async () => {
                    setAccountMenuOpen(false);
                    await navigate({ to: "/account" });
                  }}
                >
                  <span>Account settings</span>
                </button>
                <div className="h-px bg-border-subtle" />
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

function InboxIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 3.5h10v5.5l-3 1H5l-3-1V3.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M2 9l3 1h4l3-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MyIssuesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 12c.5-2 2-3 4-3s3.5 1 4 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchSidebarIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <circle
        cx="6"
        cy="6"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M11 11l-2.4-2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 11.5h9M3 9.5l5.6-5.6 1.5 1.5L4.5 11l-2 .5.5-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ViewsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 4.5l5-2.5 5 2.5-5 2.5-5-2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M2 7.5l5 2.5 5-2.5M2 10.5l5 2.5 5-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M1.5 12c.5-1.8 2-2.7 3.5-2.7s3 .9 3.5 2.7M9 12c.4-1.4 1.4-2 2.5-2 .9 0 1.7.5 2 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 4l2-1.5 5.5 3v6L4 14.5 2 13V4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 5.5L12 4v6l-2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TRY_DISMISSED_KEY = "sidebar-try-dismissed";

function TrySection() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(TRY_DISMISSED_KEY) === "1");
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TRY_DISMISSED_KEY, "1");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          Try
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-fg-faint transition-colors hover:text-fg"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-px">
        <TryItem
          label="Import issues"
          onClick={() => toast("Import coming soon")}
        />
        <TryItem
          label="Invite people"
          onClick={() => toast("Invite coming soon")}
        />
        <TryItem
          label="Connect GitHub"
          onClick={() => toast("GitHub integration coming soon")}
        />
      </div>
    </div>
  );
}

function TryItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
    >
      <span className="grid size-4 place-items-center text-fg-faint">+</span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
