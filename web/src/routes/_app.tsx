import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CaretIcon,
  DotsIcon,
  SparkleIcon,
  StarIcon,
} from "@/components/chat/icons";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardHelp } from "@/components/keyboard-help";
import { ChatsSettingsPopover } from "@/components/app-sidebar/chats-settings-popover";
import {
  ArrowOutIcon,
  SidebarSectionHeader,
} from "@/components/app-sidebar/sidebar-section-header";
import { SidebarNav } from "@/components/app-sidebar/sidebar-nav";
import { StatusIcon } from "@/components/issue/status-icon";
import { ONBOARDING_SKIP_FLAG, useOnboarding } from "@/components/onboarding/onboarding-context";
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
import { NewLabelDialog } from "@/components/label/new-label-dialog";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { ProjectIcon } from "@/components/project/project-icon";
import { TabBar } from "@/components/workspace/tab-bar";
import { findStaticPage } from "@/lib/tab-pages";
import { useChats } from "@/lib/use-chats";
import { useFavorites } from "@/lib/use-favorites";
import { useInbox } from "@/lib/use-inbox";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import {
  applyOrder,
  useSidebarLayout,
} from "@/lib/use-sidebar-layout";
import { tabsQueryOptions, useRegisterTab } from "@/lib/use-tabs";
import { userPreferencesQueryOptions, useUserPreferences } from "@/lib/use-user-preferences";
import { cn } from "@/lib/utils";

const FAVORITE_DRAG_MIME = "application/x-produktive-favorite";

const ChatWidget = lazy(() =>
  import("@/components/chat/chat-widget").then((mod) => ({
    default: mod.ChatWidget,
  })),
);

export const Route = createFileRoute("/_app")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(tabsQueryOptions());
    void context.queryClient.prefetchQuery(userPreferencesQueryOptions());
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const session = useSession();
  const { tabsEnabled } = useUserPreferences();
  const { statuses } = useIssueStatuses();
  const { pathname, search } = useRouterState({
    select: (state) => state.location,
  });
  const rawMine = (search as Record<string, unknown>).mine;
  const issuesMine =
    pathname === "/issues" &&
    (rawMine === true || rawMine === "1" || rawMine === "true");
  const staticPage = findStaticPage(pathname);
  useRegisterTab({
    tabType: "page",
    targetId: staticPage?.path ?? "",
    title: staticPage?.title ?? null,
    enabled: tabsEnabled && Boolean(staticPage),
  });
  const { chats, isLoading: chatsLoading, removeChat } = useChats();
  const {
    favorites: rawFavorites,
    isLoading: favoritesLoading,
    isFavorite,
    toggleFavorite,
  } = useFavorites();
  const { unreadCount: inboxUnread } = useInbox();
  const currentUserId = session.data?.user.id ?? null;
  const {
    layout: sidebarLayout,
    toggleFavoritesCollapsed,
    toggleChatsCollapsed,
    setFavoritesOrder,
    setChatsLimit,
    setChatsSort,
  } = useSidebarLayout();
  const favorites = applyOrder(rawFavorites, sidebarLayout.favoritesOrder, (fav) => fav.favoriteId);
  const [favDragId, setFavDragId] = useState<string | null>(null);
  const [chatsSettingsOpen, setChatsSettingsOpen] = useState(false);
  const chatsSettingsRef = useRef<HTMLDivElement | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [chatMenuOpenId, setChatMenuOpenId] = useState<string | null>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const onboarding = useOnboarding();

  useEffect(() => {
    if (!session.isPending && !session.data) {
      void navigate({ to: "/login" });
    }
  }, [navigate, session.data, session.isPending]);

  useEffect(() => {
    const user = session.data?.user;
    if (!user) return;
    if (user.onboardingCompletedAt) return;
    if (onboarding.isActive) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(ONBOARDING_SKIP_FLAG)) return;
    const id = window.setTimeout(() => {
      onboarding.start(
        (user.onboardingStep as Parameters<typeof onboarding.start>[0]) ?? undefined,
      );
    }, 500);
    return () => window.clearTimeout(id);
  }, [session.data?.user, onboarding]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
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
    if (!chatsSettingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (chatsSettingsRef.current && !chatsSettingsRef.current.contains(event.target as Node)) {
        setChatsSettingsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatsSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [chatsSettingsOpen]);

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

  const sortedChats =
    sidebarLayout.chatsSort === "alphabetical"
      ? [...chats].sort((a, b) =>
          (a.title || "").localeCompare(b.title || "", undefined, {
            sensitivity: "base",
          }),
        )
      : chats;
  const recentChats = sortedChats.slice(0, sidebarLayout.chatsLimit);

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

  const moveFavoriteBefore = (sourceFavoriteId: string, targetFavoriteId: string) => {
    if (sourceFavoriteId === targetFavoriteId) return;
    const currentOrder = favorites.map((fav) => fav.favoriteId);
    const sourceIdx = currentOrder.indexOf(sourceFavoriteId);
    const targetIdx = currentOrder.indexOf(targetFavoriteId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const next = currentOrder.filter((id) => id !== sourceFavoriteId);
    const insertAt = next.indexOf(targetFavoriteId);
    next.splice(insertAt, 0, sourceFavoriteId);
    setFavoritesOrder(next);
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
      <KeyboardHelp />
      <NewProjectDialog
        headless
        onCreated={(project) => {
          void navigate({
            to: "/projects/$projectId",
            params: { projectId: project.id },
          });
        }}
      />
      <NewLabelDialog headless />
      <Sidebar className="bg-sidebar/95" data-tour="sidebar">
        <SidebarHeader>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1" data-tour="org-switcher">
              <OrgSwitcher activeOrganization={session.data.organization} />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-5 px-4 pt-0 pb-3">
          <SidebarNav
            pathname={pathname}
            issuesMine={issuesMine}
            inboxUnread={inboxUnread}
            isEditing={editingLayout}
            onExitEditing={() => setEditingLayout(false)}
          />

          {favoritesLoading || favorites.length > 0 ? (
            <div>
              <SidebarSectionHeader
                icon={<StarIcon size={10} filled />}
                label="Favorites"
                collapsed={sidebarLayout.favoritesCollapsed}
                onToggle={toggleFavoritesCollapsed}
                trailing={
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void navigate({ to: "/favorites" });
                    }}
                    aria-label="View all favorites"
                    title="View all favorites"
                    className="grid size-5 place-items-center rounded-[5px] text-fg-faint opacity-0 transition-opacity hover:bg-surface hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent group-hover/favs-header:opacity-100"
                  >
                    <ArrowOutIcon />
                  </button>
                }
                groupClass="group/favs-header"
              />
              {sidebarLayout.favoritesCollapsed ? null : (
                <div className="flex flex-col gap-px">
                  {favoritesLoading && favorites.length === 0 ? (
                    <div className="px-2.5 py-1">
                      <LoadingTip compact />
                    </div>
                  ) : (
                    favorites.map((fav) => {
                      let targetPath = `/issues/${fav.id}`;
                      if (fav.type === "chat") {
                        targetPath = `/chat/${fav.id}`;
                      } else if (fav.type === "project") {
                        targetPath = `/projects/${fav.id}`;
                      }
                      const isActive = pathname === targetPath;
                      const goTo = () => {
                        if (fav.type === "chat") {
                          return navigate({
                            to: "/chat/$chatId",
                            params: { chatId: fav.id },
                          });
                        }
                        if (fav.type === "project") {
                          return navigate({
                            to: "/projects/$projectId",
                            params: { projectId: fav.id },
                          });
                        }
                        return navigate({
                          to: "/issues/$issueId",
                          params: { issueId: fav.id },
                        });
                      };
                      const onUnpin = async () => {
                        try {
                          await toggleFavorite(fav.type, fav.id);
                          toast.success("Removed from favorites");
                        } catch {
                          toast.error("Failed to update favorite");
                        }
                      };
                      return (
                        <div
                          key={fav.favoriteId}
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(FAVORITE_DRAG_MIME, fav.favoriteId);
                            event.dataTransfer.effectAllowed = "move";
                            setFavDragId(fav.favoriteId);
                          }}
                          onDragEnd={() => setFavDragId(null)}
                          onDragOver={(event) => {
                            if (!event.dataTransfer.types.includes(FAVORITE_DRAG_MIME)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            const sourceId = event.dataTransfer.getData(FAVORITE_DRAG_MIME);
                            if (!sourceId) return;
                            event.preventDefault();
                            moveFavoriteBefore(sourceId, fav.favoriteId);
                          }}
                          onClick={() => void goTo()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void goTo();
                            }
                          }}
                          title={displayFavoriteTitle(fav.title)}
                          className={cn(
                            "group flex h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                            isActive
                              ? "bg-surface text-fg"
                              : "text-fg-muted hover:bg-surface hover:text-fg",
                            favDragId === fav.favoriteId && "opacity-60",
                          )}
                        >
                          <span className="shrink-0 text-fg-faint group-hover:text-fg-muted">
                            {fav.type === "issue" ? (
                              <StatusIcon status={fav.status} statuses={statuses} />
                            ) : fav.type === "project" ? (
                              <ProjectIcon
                                color={fav.color}
                                icon={fav.icon}
                                name={fav.title}
                                size="sm"
                              />
                            ) : (
                              <SparkleIcon size={11} />
                            )}
                          </span>
                          <span className="flex-1 truncate">{displayFavoriteTitle(fav.title)}</span>
                          <button
                            type="button"
                            aria-label={`Unpin ${displayFavoriteTitle(fav.title)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onUnpin();
                            }}
                            className="shrink-0 rounded-[3px] text-warning opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent group-hover:opacity-100"
                          >
                            <StarIcon size={11} filled />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between pb-1.5 pl-2 pr-1">
              <button
                type="button"
                onClick={toggleChatsCollapsed}
                aria-label={sidebarLayout.chatsCollapsed ? "Expand chats" : "Collapse chats"}
                className="flex flex-1 items-center gap-1 rounded-[4px] px-0 py-px text-left text-fg-faint transition-colors hover:text-fg-muted"
              >
                <SectionChevron collapsed={sidebarLayout.chatsCollapsed} />
                <span className="text-[10.5px] font-medium uppercase tracking-[0.08em]">Chats</span>
              </button>
              <div ref={chatsSettingsRef} className="relative flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setChatsSettingsOpen((value) => !value)}
                  aria-label="Chats settings"
                  aria-expanded={chatsSettingsOpen}
                  title="Chats settings"
                  className={cn(
                    "grid size-5 place-items-center rounded-[5px] text-fg-faint transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                    chatsSettingsOpen && "bg-surface text-fg",
                  )}
                >
                  <DotsIcon />
                </button>
                <button
                  type="button"
                  onClick={() => void navigate({ to: "/chat" })}
                  aria-label="New chat"
                  title="New chat"
                  className="grid size-5 place-items-center rounded-[5px] text-fg-faint transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  <PlusIcon />
                </button>
                {chatsSettingsOpen ? (
                  <ChatsSettingsPopover
                    limit={sidebarLayout.chatsLimit}
                    sort={sidebarLayout.chatsSort}
                    onLimitChange={(value) => setChatsLimit(value)}
                    onSortChange={(value) => setChatsSort(value)}
                    onClose={() => setChatsSettingsOpen(false)}
                    onViewAll={() => {
                      setChatsSettingsOpen(false);
                      void navigate({ to: "/chats" });
                    }}
                  />
                ) : null}
              </div>
            </div>
            {sidebarLayout.chatsCollapsed ? null : (
              <div className="flex flex-col gap-px">
                {chatsLoading ? (
                  <div className="px-2.5 py-1">
                    <LoadingTip compact />
                  </div>
                ) : chats.length === 0 ? (
                  <div className="px-2.5 py-1 text-[12px] text-fg-faint">No chats yet</div>
                ) : (
                  recentChats.map((entry) => {
                    const isActive = pathname === `/chat/${entry.id}`;
                    const isCreator = currentUserId !== null && entry.createdById === currentUserId;
                    return (
                      <div key={entry.id} className="relative">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => void openChat(entry.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void openChat(entry.id);
                            }
                          }}
                          title={displayChatTitle(entry)}
                          className={cn(
                            "group flex h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                            isActive
                              ? "bg-surface text-fg"
                              : "text-fg-muted hover:bg-surface hover:text-fg",
                          )}
                        >
                          <span className="flex-1 truncate">{displayChatTitle(entry)}</span>
                          <button
                            type="button"
                            aria-label={`Actions for ${displayChatTitle(entry)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setChatMenuOpenId((current) =>
                                current === entry.id ? null : entry.id,
                              );
                            }}
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                              chatMenuOpenId === entry.id
                                ? "bg-surface-2 opacity-100"
                                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                            )}
                          >
                            <DotsIcon />
                          </button>
                        </div>
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
                                    wasFavorite ? "Removed from favorites" : "Pinned to sidebar",
                                  );
                                } catch {
                                  toast.error("Failed to update favorite");
                                }
                              }}
                            >
                              {isFavorite("chat", entry.id) ? "Unpin" : "Pin"}
                            </ChatMenuItem>
                            <ChatMenuItem onClick={() => void exportChat(entry)}>
                              Export JSON
                            </ChatMenuItem>
                            <ChatMenuItem onClick={() => void copyChatLink(entry.id)}>
                              Copy link
                            </ChatMenuItem>
                            {isCreator ? (
                              <>
                                <div className="my-1 h-px bg-border-subtle" />
                                <ChatMenuItem danger onClick={() => void handleDeleteChat(entry)}>
                                  Delete
                                </ChatMenuItem>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
                {chats.length > recentChats.length ? (
                  <button
                    type="button"
                    onClick={() => void navigate({ to: "/chats" })}
                    className="mt-0.5 px-2.5 py-1 text-left text-[11.5px] text-fg-muted transition-colors hover:text-fg"
                  >
                    View all {chats.length} →
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </SidebarContent>

        <SidebarFooter className="relative">
          <div ref={accountMenuRef}>
            {accountMenuOpen ? (
              <div
                className={cn(
                  "absolute left-4 right-4 overflow-hidden rounded-[9px] border border-border bg-surface animate-fade-up",
                  "bottom-18.5",
                )}
              >
                <div className="border-b border-border-subtle px-3 py-2.5">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {currentUser?.name ?? "User"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-fg-muted">{currentUser?.email}</p>
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
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between px-3 text-left text-[13px] text-fg transition-colors hover:bg-surface-2"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setEditingLayout(true);
                  }}
                >
                  <span>Customize sidebar</span>
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
              <AccountIcon name={currentUser?.name ?? "User"} image={currentUser?.image} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-medium text-fg"
                  title={currentUser?.name ?? "User"}
                >
                  {currentUser?.name ?? "User"}
                </p>
                <p className="truncate text-[11px] text-fg-muted" title={currentUser?.email}>
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
        <TabBar enabled={tabsEnabled} />
      </SidebarInset>
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
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

function AccountIcon({ name, image }: { name: string; image?: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className="size-8 shrink-0 rounded-[8px] border border-border object-cover"
      />
    );
  }
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    tokens.length === 0
      ? "P"
      : tokens.length === 1
        ? tokens[0].slice(0, 2).toUpperCase()
        : (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-border bg-surface text-[12px] font-medium text-fg">
      {initials}
    </div>
  );
}

function displayChatTitle(chat: Chat) {
  return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
}

function displayFavoriteTitle(title: string) {
  return parseMessageWithAttachments(title).text.trim() || "Untitled";
}

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "chat"
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

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SectionChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      style={{
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
    >
      <path
        d="M3 4.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

