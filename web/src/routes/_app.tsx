import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CaretIcon,
  DotsIcon,
  InboxIcon,
  IssuesIcon,
  ProjectsIcon,
  SparkleIcon,
  StarIcon,
} from "@/components/chat/icons";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardHelp } from "@/components/keyboard-help";
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
import { ProjectIcon } from "@/components/project/project-icon";
import { ISSUE_DRAG_MIME } from "@/components/issue/issue-list";
import { NewLabelDialog } from "@/components/label/new-label-dialog";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { updateIssue } from "@/lib/api";
import { TabBar } from "@/components/workspace/tab-bar";
import { findStaticPage } from "@/lib/tab-pages";
import { useChats } from "@/lib/use-chats";
import { useFavorites } from "@/lib/use-favorites";
import { useInbox } from "@/lib/use-inbox";
import { useProjects } from "@/lib/use-projects";
import { tabsQueryOptions, useRegisterTab } from "@/lib/use-tabs";
import { userPreferencesQueryOptions, useUserPreferences } from "@/lib/use-user-preferences";
import { cn } from "@/lib/utils";

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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const staticPage = findStaticPage(pathname);
  useRegisterTab({
    tabType: "page",
    targetId: staticPage?.path ?? "",
    title: staticPage?.title ?? null,
    enabled: tabsEnabled && Boolean(staticPage),
  });
  const { chats, isLoading: chatsLoading, removeChat } = useChats();
  const { favorites, isLoading: favoritesLoading, isFavorite, toggleFavorite } = useFavorites();
  const { unreadCount: inboxUnread } = useInbox();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [chatMenuOpenId, setChatMenuOpenId] = useState<string | null>(null);
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

  const isIssuesActive = pathname === "/issues" || pathname.startsWith("/issues/");
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
                if (pathname !== "/issues" && !pathname.startsWith("/issues/")) {
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
                    return (
                      <button
                        key={fav.favoriteId}
                        type="button"
                        onClick={() => void goTo()}
                        title={displayFavoriteTitle(fav.title)}
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
                        <span
                          className="shrink-0 text-warning opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-[3px] hover:text-fg"
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
                onClick={() => void navigate({ to: "/workspace" })}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
                  pathname === "/workspace"
                    ? "bg-surface-2 text-fg [&_svg]:text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <OverviewIcon />
                <span className="flex-1 truncate">Overview</span>
              </button>

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
                onClick={() => void navigate({ to: "/projects" })}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
                  pathname === "/projects" || pathname.startsWith("/projects/")
                    ? "bg-surface-2 text-fg [&_svg]:text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <ProjectsIcon />
                <span className="flex-1 truncate">Projects</span>
              </button>
              <SidebarRecentProjects pathname={pathname} />
              <button
                type="button"
                onClick={() => void navigate({ to: "/labels" })}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
                  pathname === "/labels"
                    ? "bg-surface-2 text-fg [&_svg]:text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <SidebarLabelsIcon />
                <span className="flex-1 truncate">Labels</span>
              </button>
            </div>
          </div>

          <TrySection />

          <div>
            <div className="flex items-center justify-between pb-1.5 pl-2 pr-1">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                Chats
              </span>
              <button
                type="button"
                onClick={() => void navigate({ to: "/chat" })}
                aria-label="New chat"
                title="New chat"
                className="grid size-5 place-items-center rounded-[5px] text-fg-faint transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <PlusIcon />
              </button>
            </div>
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
                  return (
                    <div key={entry.id} className="relative">
                      <button
                        type="button"
                        onClick={() => void openChat(entry.id)}
                        title={displayChatTitle(entry)}
                        className={cn(
                          "group flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
                          isActive
                            ? "bg-surface text-fg"
                            : "text-fg-muted hover:bg-surface hover:text-fg",
                        )}
                      >
                        <span className="flex-1 truncate">{displayChatTitle(entry)}</span>
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
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
                          <ChatMenuItem onClick={() => void openChat(entry.id)}>Open</ChatMenuItem>
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
                          <div className="my-1 h-px bg-border-subtle" />
                          <ChatMenuItem danger onClick={() => void handleDeleteChat(entry)}>
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
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l-2.4-2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
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

function SidebarRecentProjects({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const { projects } = useProjects(false);
  const recent = projects
    .filter((p) => p.archivedAt === null && p.status !== "cancelled")
    .slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <div className="ml-3 mt-0.5 flex flex-col gap-px border-l border-border-subtle/60 pl-2">
      {recent.map((project) => {
        const isActive =
          pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}`);
        return (
          <button
            key={project.id}
            type="button"
            title={project.name}
            onClick={() =>
              void navigate({
                to: "/projects/$projectId",
                params: { projectId: project.id },
              })
            }
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(ISSUE_DRAG_MIME)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              event.currentTarget.classList.add("ring-2", "ring-accent", "bg-accent/15");
            }}
            onDragLeave={(event) => {
              event.currentTarget.classList.remove("ring-2", "ring-accent", "bg-accent/15");
            }}
            onDrop={(event) => {
              event.currentTarget.classList.remove("ring-2", "ring-accent", "bg-accent/15");
              const issueId = event.dataTransfer.getData(ISSUE_DRAG_MIME);
              if (!issueId) return;
              event.preventDefault();
              void (async () => {
                try {
                  await updateIssue(issueId, { projectId: project.id });
                  toast.success(`Added to ${project.name}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to add to project");
                }
              })();
            }}
            className={cn(
              "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] transition-colors",
              isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
            )}
          >
            <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="sm" />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.issueCount > 0 ? (
              <span className="shrink-0 text-[10px] tabular-nums text-fg-faint">
                {project.doneCount}/{project.issueCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function OverviewIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="8" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8" y="8" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SidebarLabelsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="4.5" r="0.9" fill="currentColor" />
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
    </div>
  );
}
