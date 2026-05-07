import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CaretIcon,
  SettingsIcon,
  SidebarIcon,
  SparkleIcon,
  StarIcon,
} from "@/components/chat/icons";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardHelp } from "@/components/keyboard-help";
import { SidebarSectionHeader } from "@/components/app-sidebar/sidebar-section-header";
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
import { recordTwoFactorEnforcementBlocked } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { parseMessageWithAttachments } from "@/lib/chat-attachments";
import { NewLabelDialog } from "@/components/label/new-label-dialog";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { ProjectIcon } from "@/components/project/project-icon";
import { TabBar } from "@/components/workspace/tab-bar";
import { findStaticPage } from "@/lib/tab-pages";
import { useFavorites } from "@/lib/use-favorites";
import { useInbox } from "@/lib/use-inbox";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { applyOrder, useSidebarLayout } from "@/lib/use-sidebar-layout";
import { tabsQueryOptions, useRegisterTab } from "@/lib/use-tabs";
import { userPreferencesQueryOptions, useUserPreferences } from "@/lib/use-user-preferences";
import { useWorkspaceRealtime } from "@/lib/use-workspace-realtime";
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
    pathname === "/issues" && (rawMine === true || rawMine === "1" || rawMine === "true");
  const staticPage = findStaticPage(pathname);
  useRegisterTab({
    tabType: "page",
    targetId: staticPage?.path ?? "",
    title: staticPage?.title ?? null,
    enabled: tabsEnabled && Boolean(staticPage),
  });
  const {
    favorites: rawFavorites,
    isLoading: favoritesLoading,
    toggleFavorite,
  } = useFavorites();
  const { unreadCount: inboxUnread } = useInbox();
  const {
    layout: sidebarLayout,
    toggleFavoritesCollapsed,
    setFavoritesOrder,
  } = useSidebarLayout();
  const favorites = applyOrder(rawFavorites, sidebarLayout.favoritesOrder, (fav) => fav.favoriteId);
  const [favDragId, setFavDragId] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const onboarding = useOnboarding();
  useWorkspaceRealtime(Boolean(session.data));

  useEffect(() => {
    if (!session.isPending && !session.data) {
      void navigate({ to: "/login" });
    }
  }, [navigate, session.data, session.isPending]);

  useEffect(() => {
    if (!session.data) return;
    if (!session.data.organization.requireTwoFactor || session.data.user.twoFactorEnabled) return;
    if (pathname === "/account") return;
    const redirect = `${pathname}${window.location.search}${window.location.hash}`;
    const blockKey = `produktive:2fa-blocked:${session.data.organization.id}:${session.data.user.id}`;
    if (typeof window !== "undefined" && !window.sessionStorage.getItem(blockKey)) {
      window.sessionStorage.setItem(blockKey, "1");
      void recordTwoFactorEnforcementBlocked().catch(() => {});
    }
    toast.message("This workspace requires two-factor authentication.");
    void navigate({
      to: "/account",
      search: { section: "security", twoFactorRequired: "1", redirect },
    });
  }, [navigate, pathname, session.data]);

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

  const currentUser = session.data?.user;

  if (session.isPending || !session.data) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="bg-dotgrid" aria-hidden />
        <LoadingTip />
      </main>
    );
  }

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

        </SidebarContent>

        <SidebarFooter className="relative">
          <div ref={accountMenuRef}>
            {accountMenuOpen ? (
              <div
                className={cn(
                  "absolute left-3 right-3 z-30 overflow-hidden",
                  "rounded-[12px] border border-border-subtle/80 bg-bg/85 backdrop-blur-2xl",
                  "widget-panel-shadow animate-account-pop",
                  "bottom-18.5",
                )}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-fg-muted/40 to-transparent"
                />

                <div className="relative px-3 pt-3 pb-2.5">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
                  />
                  <p className="truncate text-[13px] font-medium text-fg">
                    {currentUser?.name ?? "User"}
                  </p>
                  {session.data.organization?.name ? (
                    <p className="mt-0.5 truncate text-[11px] text-fg-faint">
                      {session.data.organization.name}
                    </p>
                  ) : null}
                </div>

                <div className="py-1">
                  <AccountMenuItem
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await navigate({ to: "/account" });
                    }}
                    icon={<SettingsIcon size={13} />}
                  >
                    Account settings
                  </AccountMenuItem>
                  <AccountMenuItem
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setEditingLayout(true);
                    }}
                    icon={<SidebarIcon size={13} />}
                  >
                    Customize sidebar
                  </AccountMenuItem>
                </div>

                <div className="relative h-px">
                  <div
                    aria-hidden
                    className="absolute inset-x-3 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
                  />
                </div>

                <div className="py-1">
                  <AccountMenuItem
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await signOut();
                      await navigate({ to: "/login" });
                    }}
                    icon={<SignOutIcon />}
                  >
                    Sign out
                  </AccountMenuItem>
                </div>
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

function AccountMenuItem({
  children,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={cn(
        "group flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-fg",
        "transition-colors",
        "hover:bg-surface/60",
      )}
    >
      {icon ? (
        <span className="grid size-4 shrink-0 place-items-center text-fg-faint transition-colors group-hover:text-fg-muted">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
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

function displayFavoriteTitle(title: string) {
  return parseMessageWithAttachments(title).text.trim() || "Untitled";
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

