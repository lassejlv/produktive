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
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { useProjects } from "@/lib/use-projects";
import {
  type SidebarItemId,
  defaultSidebarLayout,
  useSidebarLayout,
} from "@/lib/use-sidebar-layout";
import { tabsQueryOptions, useRegisterTab } from "@/lib/use-tabs";
import { userPreferencesQueryOptions, useUserPreferences } from "@/lib/use-user-preferences";
import type { SidebarLayoutItem } from "@/lib/api";
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
  const { statuses } = useIssueStatuses();
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
          <SidebarNav
            pathname={pathname}
            inboxUnread={inboxUnread}
            isEditing={editingLayout}
            onExitEditing={() => setEditingLayout(false)}
          />

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
            </div>
          ) : null}

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

type NavItemSpec = {
  id: SidebarItemId;
  label: string;
  icon: React.ReactNode;
  isActive: (pathname: string) => boolean;
  onNavigate: (navigate: ReturnType<typeof useNavigate>) => void;
};

const NAV_ITEM_SPECS: Record<SidebarItemId, NavItemSpec> = {
  inbox: {
    id: "inbox",
    label: "Inbox",
    icon: <InboxIcon />,
    isActive: (p) => p === "/inbox",
    onNavigate: (n) => void n({ to: "/inbox" }),
  },
  "my-issues": {
    id: "my-issues",
    label: "My issues",
    icon: <MyIssuesIcon />,
    isActive: () => false,
    onNavigate: (n) => void n({ to: "/issues", search: { mine: true } }),
  },
  overview: {
    id: "overview",
    label: "Overview",
    icon: <OverviewIcon />,
    isActive: (p) => p === "/workspace",
    onNavigate: (n) => void n({ to: "/workspace" }),
  },
  issues: {
    id: "issues",
    label: "Issues",
    icon: <IssuesIcon />,
    isActive: (p) => p === "/issues" || p.startsWith("/issues/"),
    onNavigate: (n) => void n({ to: "/issues" }),
  },
  projects: {
    id: "projects",
    label: "Projects",
    icon: <ProjectsIcon />,
    isActive: (p) => p === "/projects" || p.startsWith("/projects/"),
    onNavigate: (n) => void n({ to: "/projects" }),
  },
  labels: {
    id: "labels",
    label: "Labels",
    icon: <SidebarLabelsIcon />,
    isActive: (p) => p === "/labels",
    onNavigate: (n) => void n({ to: "/labels" }),
  },
};

function SidebarNav({
  pathname,
  inboxUnread,
  isEditing,
  onExitEditing,
}: {
  pathname: string;
  inboxUnread: number;
  isEditing: boolean;
  onExitEditing: () => void;
}) {
  const navigate = useNavigate();
  const { layout: savedLayout, save, reset, isSaving } = useSidebarLayout();
  const [draft, setDraft] = useState<SidebarLayoutItem[]>(savedLayout);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) setDraft(savedLayout);
  }, [isEditing, savedLayout]);

  const items = isEditing ? draft : savedLayout;

  const moveBefore = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setDraft((current) => {
      const next = current.filter((item) => item.id !== sourceId);
      const sourceItem = current.find((item) => item.id === sourceId);
      if (!sourceItem) return current;
      const targetIdx = next.findIndex((item) => item.id === targetId);
      if (targetIdx < 0) return current;
      next.splice(targetIdx, 0, sourceItem);
      return next;
    });
  };

  const toggleHidden = (id: string) => {
    setDraft((current) =>
      current.map((item) =>
        item.id === id ? { ...item, hidden: !item.hidden } : item,
      ),
    );
  };

  const onDone = () => {
    save(draft);
    onExitEditing();
  };

  const onCancel = () => {
    setDraft(savedLayout);
    onExitEditing();
  };

  const onReset = () => {
    setDraft(defaultSidebarLayout);
  };

  return (
    <div className="flex flex-col gap-px">
      {items.map((entry) => {
        const spec = NAV_ITEM_SPECS[entry.id as SidebarItemId];
        if (!spec) return null;
        const hidden = entry.hidden === true;
        if (!isEditing && hidden) return null;
        const active = spec.isActive(pathname);
        const showRecent =
          !isEditing && spec.id === "projects" && !hidden;
        return (
          <div key={entry.id}>
            <SidebarNavRow
              spec={spec}
              isEditing={isEditing}
              hidden={hidden}
              active={active}
              isDragging={dragId === entry.id}
              onClick={() => spec.onNavigate(navigate)}
              onToggleHidden={() => toggleHidden(entry.id)}
              onDragStart={() => setDragId(entry.id)}
              onDragEnd={() => setDragId(null)}
              onDropOnto={(sourceId) => moveBefore(sourceId, entry.id)}
              trailing={
                spec.id === "inbox" && inboxUnread > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white">
                    {inboxUnread > 99 ? "99+" : inboxUnread}
                  </span>
                ) : null
              }
            />
            {showRecent ? <SidebarRecentProjects pathname={pathname} /> : null}
          </div>
        );
      })}
      {isEditing ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[8px] border border-border-subtle bg-surface/40 px-2.5 py-2 text-[11.5px]">
          <button
            type="button"
            onClick={onReset}
            className="text-fg-muted transition-colors hover:text-fg"
          >
            Reset
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-0.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDone}
              disabled={isSaving}
              className="rounded-md bg-fg px-2 py-0.5 font-medium text-bg transition-colors hover:bg-white disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const NAV_DRAG_MIME = "application/x-produktive-sidebar-item";

function SidebarNavRow({
  spec,
  isEditing,
  hidden,
  active,
  isDragging,
  trailing,
  onClick,
  onToggleHidden,
  onDragStart,
  onDragEnd,
  onDropOnto,
}: {
  spec: NavItemSpec;
  isEditing: boolean;
  hidden: boolean;
  active: boolean;
  isDragging: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
  onToggleHidden: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnto: (sourceId: string) => void;
}) {
  const [dropping, setDropping] = useState(false);

  if (isEditing) {
    return (
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(NAV_DRAG_MIME, spec.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={() => {
          setDropping(false);
          onDragEnd();
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(NAV_DRAG_MIME)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (!dropping) setDropping(true);
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          )
            return;
          setDropping(false);
        }}
        onDrop={(event) => {
          const sourceId = event.dataTransfer.getData(NAV_DRAG_MIME);
          setDropping(false);
          if (!sourceId) return;
          event.preventDefault();
          onDropOnto(sourceId);
        }}
        className={cn(
          "group flex h-8 w-full select-none items-center gap-1.5 rounded-[7px] border border-transparent pl-1 pr-1.5 text-[13px] transition-colors",
          dropping
            ? "border-accent/40 bg-accent/10"
            : "border-border-subtle/60 bg-surface/30",
          isDragging && "opacity-60",
          hidden && !dropping && "text-fg-faint",
        )}
      >
        <span
          aria-hidden
          className="cursor-grab text-fg-faint hover:text-fg active:cursor-grabbing"
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </span>
        <span className={cn("shrink-0", hidden ? "text-fg-faint" : "text-fg-muted")}>
          {spec.icon}
        </span>
        <span className="flex-1 truncate">{spec.label}</span>
        <button
          type="button"
          onClick={onToggleHidden}
          aria-label={hidden ? `Show ${spec.label}` : `Hide ${spec.label}`}
          title={hidden ? "Show" : "Hide"}
          className="grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
        active
          ? "bg-surface-2 text-fg [&_svg]:text-fg"
          : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {spec.icon}
      <span className="flex-1 truncate">{spec.label}</span>
      {trailing}
    </button>
  );
}

function DragHandleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="4" cy="3" r="0.9" fill="currentColor" />
      <circle cx="8" cy="3" r="0.9" fill="currentColor" />
      <circle cx="4" cy="6" r="0.9" fill="currentColor" />
      <circle cx="8" cy="6" r="0.9" fill="currentColor" />
      <circle cx="4" cy="9" r="0.9" fill="currentColor" />
      <circle cx="8" cy="9" r="0.9" fill="currentColor" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 7s2-4 6-4c1 0 1.9.2 2.7.6M13 7s-2 4-6 4c-1 0-1.9-.2-2.7-.6M2 12L12 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

