import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SparkleIcon, StarIcon } from "@/components/chat/icons";
import { StatusIcon } from "@/components/issue/status-icon";
import { ProjectIcon } from "@/components/project/project-icon";
import { type Favorite, type FavoriteTarget } from "@/lib/api";
import { parseMessageWithAttachments } from "@/lib/chat-attachments";
import { useFavorites } from "@/lib/use-favorites";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { applyOrder, useSidebarLayout } from "@/lib/use-sidebar-layout";
import { cn } from "@/lib/utils";

type FavoritesSearch = {
  q?: string;
  type?: FavoriteTarget | "all";
};

const isType = (value: unknown): value is FavoriteTarget | "all" =>
  value === "all" || value === "issue" || value === "project" || value === "chat";

export const Route = createFileRoute("/_app/favorites")({
  validateSearch: (search: Record<string, unknown>): FavoritesSearch => ({
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    type: isType(search.type) ? search.type : undefined,
  }),
  component: FavoritesPage,
});

const typeTabs: { value: FavoriteTarget | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issue", label: "Issues" },
  { value: "project", label: "Projects" },
  { value: "chat", label: "Chats" },
];

const FAVORITE_DRAG_MIME = "application/x-produktive-favorite-page";

function FavoritesPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { favorites: rawFavorites, isLoading, toggleFavorite } = useFavorites();
  const { layout, setFavoritesOrder } = useSidebarLayout();
  const { statuses } = useIssueStatuses();
  const ordered = applyOrder(
    rawFavorites,
    layout.favoritesOrder,
    (fav) => fav.favoriteId,
  );

  const [query, setQuery] = useState(search.q ?? "");
  const [typeFilter, setTypeFilter] = useState<FavoriteTarget | "all">(
    search.type ?? "all",
  );
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ordered.filter((fav) => {
      if (typeFilter !== "all" && fav.type !== typeFilter) return false;
      if (!q) return true;
      return fav.title.toLowerCase().includes(q);
    });
  }, [ordered, typeFilter, query]);

  const counts = useMemo(
    () => ({
      all: ordered.length,
      issue: ordered.filter((f) => f.type === "issue").length,
      project: ordered.filter((f) => f.type === "project").length,
      chat: ordered.filter((f) => f.type === "chat").length,
    }),
    [ordered],
  );

  const moveBefore = (sourceFavoriteId: string, targetFavoriteId: string) => {
    if (sourceFavoriteId === targetFavoriteId) return;
    const currentOrder = ordered.map((fav) => fav.favoriteId);
    const sourceIdx = currentOrder.indexOf(sourceFavoriteId);
    const targetIdx = currentOrder.indexOf(targetFavoriteId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const next = currentOrder.filter((id) => id !== sourceFavoriteId);
    const insertAt = next.indexOf(targetFavoriteId);
    next.splice(insertAt, 0, sourceFavoriteId);
    setFavoritesOrder(next);
  };

  const goTo = (fav: Favorite) => {
    if (fav.type === "chat") {
      return navigate({ to: "/chat/$chatId", params: { chatId: fav.id } });
    }
    if (fav.type === "project") {
      return navigate({ to: "/projects/$projectId", params: { projectId: fav.id } });
    }
    return navigate({ to: "/issues/$issueId", params: { issueId: fav.id } });
  };

  const handleUnpin = async (fav: Favorite) => {
    try {
      await toggleFavorite(fav.type, fav.id);
      toast.success("Removed from favorites");
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const updateSearch = (next: FavoritesSearch) => {
    void navigate({
      to: "/favorites",
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });
  };

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-warning">
            <StarIcon size={12} filled />
          </span>
          <h1 className="text-sm font-medium text-fg">Favorites</h1>
          <span className="text-xs text-fg-muted tabular-nums">
            {filtered.length}
          </span>
        </div>
        <span className="hidden text-[11px] text-fg-faint sm:inline">
          Drag to reorder
        </span>
      </header>

      <nav className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-bg px-5 py-2">
        <div className="flex flex-1 items-center gap-1">
          {typeTabs.map((tab) => {
            const isActive = typeFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setTypeFilter(tab.value);
                  updateSearch({ type: tab.value === "all" ? undefined : tab.value });
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                  isActive
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    isActive ? "text-fg-muted" : "text-fg-faint",
                  )}
                >
                  {counts[tab.value]}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          placeholder="Search favorites…"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            updateSearch({ q: next.trim() ? next.trim() : undefined });
          }}
          className="h-7 w-44 rounded-md border border-border-subtle bg-transparent px-2 text-[12.5px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border"
        />
      </nav>

      <section className="mx-auto w-full max-w-[760px] px-5 py-6">
        {isLoading ? (
          <p className="text-[13px] text-fg-faint">Loading…</p>
        ) : ordered.length === 0 ? (
          <FavoritesEmptyState />
        ) : filtered.length === 0 ? (
          <p className="text-[13px] text-fg-faint">
            No favorites match this filter.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-border-subtle">
            {filtered.map((fav, index) => (
              <li
                key={fav.favoriteId}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(FAVORITE_DRAG_MIME, fav.favoriteId);
                  event.dataTransfer.effectAllowed = "move";
                  setDragId(fav.favoriteId);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(FAVORITE_DRAG_MIME)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  const sourceId = event.dataTransfer.getData(FAVORITE_DRAG_MIME);
                  if (!sourceId) return;
                  event.preventDefault();
                  moveBefore(sourceId, fav.favoriteId);
                }}
                className={cn(
                  "group flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors",
                  index !== filtered.length - 1 && "border-b border-border-subtle",
                  dragId === fav.favoriteId && "opacity-60",
                )}
              >
                <span className="text-fg-faint" aria-hidden>
                  <DragHandleIcon />
                </span>
                <button
                  type="button"
                  onClick={() => void goTo(fav)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="shrink-0 text-fg-faint">
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
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {displayFavoriteTitle(fav.title)}
                  </span>
                  <span className="shrink-0 rounded-[4px] border border-border-subtle px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-fg-faint">
                    {fav.type}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleUnpin(fav)}
                  aria-label={`Unpin ${displayFavoriteTitle(fav.title)}`}
                  className="rounded-md px-2 py-0.5 text-[11.5px] text-warning opacity-60 transition-colors hover:bg-surface hover:text-fg group-hover:opacity-100"
                >
                  Unpin
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function FavoritesEmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-surface/60 text-fg-muted">
        <StarIcon size={20} filled />
      </div>
      <h2 className="text-[15px] font-medium text-fg">Nothing pinned yet</h2>
      <p className="mt-1 max-w-[360px] text-[13px] text-fg-muted">
        Pin issues, projects, or chats to see them here and in the sidebar.
      </p>
    </div>
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

function displayFavoriteTitle(title: string) {
  return parseMessageWithAttachments(title).text.trim() || "Untitled";
}
