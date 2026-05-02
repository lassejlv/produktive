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

type TypeFilter = FavoriteTarget | "all";

type FavoritesSearch = {
  q?: string;
  type?: TypeFilter;
};

const isType = (value: unknown): value is TypeFilter =>
  value === "all" || value === "issue" || value === "project" || value === "chat";

export const Route = createFileRoute("/_app/favorites")({
  validateSearch: (search: Record<string, unknown>): FavoritesSearch => ({
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    type: isType(search.type) ? search.type : undefined,
  }),
  component: FavoritesPage,
});

const typeTabs: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issue", label: "Issues" },
  { value: "project", label: "Projects" },
  { value: "chat", label: "Chats" },
];

const typeOrder: FavoriteTarget[] = ["issue", "project", "chat"];

const typeLabels: Record<FavoriteTarget, string> = {
  issue: "Issues",
  project: "Projects",
  chat: "Chats",
};

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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
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

  const groups = useMemo(() => {
    if (typeFilter !== "all") {
      return [{ type: typeFilter as FavoriteTarget, items: filtered }];
    }
    const buckets = new Map<FavoriteTarget, Favorite[]>();
    for (const fav of filtered) {
      const list = buckets.get(fav.type) ?? [];
      list.push(fav);
      buckets.set(fav.type, list);
    }
    return typeOrder
      .filter((type) => buckets.has(type))
      .map((type) => ({ type, items: buckets.get(type) ?? [] }));
  }, [filtered, typeFilter]);

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
      <header className="border-b border-border-subtle px-8 pb-6 pt-10">
        <div className="mx-auto flex w-full max-w-[920px] items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-faint">
              Pinned items
            </p>
            <h1 className="mt-1.5 flex items-center gap-2 text-[26px] font-medium leading-none tracking-[-0.02em] text-fg">
              <span className="text-warning">
                <StarIcon size={18} filled />
              </span>
              Favorites
            </h1>
            <p className="mt-1.5 text-[12.5px] text-fg-muted">
              <span className="tabular-nums text-fg">{counts.all}</span>{" "}
              {counts.all === 1 ? "item" : "items"} pinned
              {ordered.length > 0 ? (
                <>
                  {" · "}
                  <span className="text-fg-faint">drag to reorder</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b border-border-subtle bg-bg/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[920px] items-center gap-3 px-8 py-2.5">
          <div className="relative flex min-w-0 flex-1 items-center">
            <span className="pointer-events-none absolute left-2 text-fg-faint">
              <SearchIcon />
            </span>
            <input
              type="search"
              placeholder="Search favorites…"
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                updateSearch({ q: next.trim() ? next.trim() : undefined });
              }}
              className="h-8 w-full bg-transparent pl-7 pr-2 text-[13px] text-fg outline-none placeholder:text-fg-faint"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border-subtle p-0.5">
            {typeTabs.map((tab) => {
              const isActive = typeFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setTypeFilter(tab.value);
                    updateSearch({
                      type: tab.value === "all" ? undefined : tab.value,
                    });
                  }}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11.5px] transition-colors",
                    isActive
                      ? "bg-surface text-fg"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "tabular-nums text-[10.5px]",
                      isActive ? "text-fg-muted" : "text-fg-faint",
                    )}
                  >
                    {counts[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="mx-auto w-full max-w-[920px] px-8 pb-24 pt-2">
        {isLoading ? (
          <p className="px-2 py-8 text-[13px] text-fg-faint">Loading…</p>
        ) : ordered.length === 0 ? (
          <FavoritesEmptyState />
        ) : filtered.length === 0 ? (
          <div className="px-2 py-12 text-center">
            <p className="text-[13px] text-fg">
              No favorites match this filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTypeFilter("all");
                updateSearch({ q: undefined, type: undefined });
              }}
              className="mt-2 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {groups.map((group, gIdx) => (
              <div key={group.type} className={cn(gIdx > 0 && "mt-8")}>
                {typeFilter === "all" ? (
                  <div className="mb-2 flex items-baseline gap-2 px-2">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
                      {typeLabels[group.type]}
                    </span>
                    <span className="text-[10.5px] tabular-nums text-fg-faint">
                      {group.items.length}
                    </span>
                  </div>
                ) : null}
                <ul>
                  {group.items.map((fav, idx) => (
                    <li
                      key={fav.favoriteId}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          FAVORITE_DRAG_MIME,
                          fav.favoriteId,
                        );
                        event.dataTransfer.effectAllowed = "move";
                        setDragId(fav.favoriteId);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onDragOver={(event) => {
                        if (
                          !event.dataTransfer.types.includes(FAVORITE_DRAG_MIME)
                        )
                          return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        const sourceId = event.dataTransfer.getData(
                          FAVORITE_DRAG_MIME,
                        );
                        if (!sourceId) return;
                        event.preventDefault();
                        moveBefore(sourceId, fav.favoriteId);
                      }}
                      className={cn(
                        "group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-3 transition-colors hover:bg-surface/50 last:border-b-0",
                        idx === 0 && "border-t border-border-subtle/60",
                        dragId === fav.favoriteId && "opacity-50",
                      )}
                    >
                      <span
                        className="cursor-grab text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                        aria-hidden
                        title="Drag to reorder"
                      >
                        <DragHandleIcon />
                      </span>
                      <button
                        type="button"
                        onClick={() => void goTo(fav)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="shrink-0 text-fg-faint">
                          {fav.type === "issue" ? (
                            <StatusIcon
                              status={fav.status}
                              statuses={statuses}
                            />
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
                        <span className="min-w-0 flex-1 truncate text-[14px] text-fg">
                          {displayFavoriteTitle(fav.title)}
                        </span>
                        {typeFilter === "all" ? null : (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
                            {fav.type}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUnpin(fav)}
                        aria-label={`Unpin ${displayFavoriteTitle(fav.title)}`}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-warning opacity-0 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent group-hover:opacity-100"
                        title="Unpin"
                      >
                        <StarIcon size={11} filled />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {ordered.length > 0 ? (
          <footer className="mt-12 flex items-center justify-center gap-3 border-t border-border-subtle/50 pt-4 text-[11px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <span className="text-fg-muted">Search anything</span>
            </span>
            <span className="text-fg-faint/40">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-fg-muted">Pin from any item's</span>
              <span className="inline-flex size-3.5 items-center justify-center rounded-[3px] border border-border-subtle text-warning">
                <StarIcon size={9} filled />
              </span>
              <span className="text-fg-muted">menu</span>
            </span>
          </footer>
        ) : null}
      </section>
    </main>
  );
}

function FavoritesEmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-24 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-warning">
        <StarIcon size={18} filled />
      </div>
      <h2 className="text-[16px] font-medium tracking-[-0.01em] text-fg">
        Nothing pinned yet
      </h2>
      <p className="mt-1.5 max-w-[400px] text-[13px] leading-relaxed text-fg-muted">
        Pin issues, projects, or chats — they'll show up here and at the top of
        the sidebar so you can jump back fast.
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

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 11l-2.4-2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="grid h-4 min-w-4 place-items-center rounded-[3px] border border-border-subtle bg-surface px-1 font-mono text-[10px] text-fg-muted">
      {children}
    </kbd>
  );
}

function displayFavoriteTitle(title: string) {
  return parseMessageWithAttachments(title).text.trim() || "Untitled";
}
