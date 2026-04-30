import {
  Link,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { IssuesIcon, StarIcon } from "@/components/chat/icons";
import { EmptyState } from "@/components/empty-state";
import { BulkActionBar } from "@/components/issue/bulk-action-bar";
import { IssueBoard } from "@/components/issue/issue-board";
import {
  ISSUE_DRAG_MIME,
  IssueList,
} from "@/components/issue/issue-list";
import {
  IssueFilterChips,
  IssueToolbar,
  emptyFilters,
  type IssueFilters,
} from "@/components/issue/issue-toolbar";
import { NewIssueDialog } from "@/components/issue/new-issue-dialog";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { DashboardSkeleton } from "@/components/issue-skeleton";
import { IssueDetail } from "@/routes/_app.issues.$issueId";
import { createIssue, deleteIssue, updateIssue } from "@/lib/api";
import { statusLabel, type View, viewLabels } from "@/lib/issue-constants";
import { useDisplayOptions } from "@/lib/issue-display";
import { useFavorites } from "@/lib/use-favorites";
import { useIssues } from "@/lib/use-issues";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const viewDropStatus: Record<View, string | null> = {
  all: null,
  active: "todo",
  backlog: "backlog",
  done: "done",
};

export const Route = createFileRoute("/_app/issues")({
  component: IssuesPage,
});

const viewKeys = Object.keys(viewLabels) as View[];

function IssuesPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const issueId = pathname.startsWith("/issues/")
    ? decodeURIComponent(pathname.slice("/issues/".length))
    : null;
  const {
    issues,
    isLoading,
    error,
    dismissError,
    addIssue,
    updateIssueLocal,
    removeIssueLocal,
  } = useIssues();
  const [view, setView] = useState<View>("all");
  const [dragOverView, setDragOverView] = useState<View | null>(null);
  const [filters, setFilters] = useState<IssueFilters>(emptyFilters);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { options: displayOptions, update: updateDisplay, updateProperties } =
    useDisplayOptions();
  const isNarrowViewport = useMediaQuery("(max-width: 1023px)");
  const effectiveViewMode =
    isNarrowViewport && displayOptions.viewMode === "board"
      ? "list"
      : displayOptions.viewMode;
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [viewFavorited, setViewFavorited] = useState(false);
  const onboarding = useOnboarding();

  useEffect(() => {
    onboarding.setFirstIssueId(issues[0]?.id ?? null);
  }, [issues, onboarding]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewFavorited(
      window.localStorage.getItem(`issues-view-fav:${view}`) === "1",
    );
  }, [view]);

  const toggleViewFavorited = () => {
    setViewFavorited((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        if (next) window.localStorage.setItem(`issues-view-fav:${view}`, "1");
        else window.localStorage.removeItem(`issues-view-fav:${view}`);
      }
      return next;
    });
  };

  const handleToggleFavorite = (id: string) => {
    void (async () => {
      const wasFavorite = isFavorite("issue", id);
      try {
        await toggleFavorite("issue", id);
        toast.success(
          wasFavorite ? "Removed from favorites" : "Pinned to sidebar",
        );
      } catch {
        toast.error("Failed to update favorite");
      }
    })();
  };

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const filteredIssues = useMemo(() => {
    let pool = issues;
    if (view === "active") {
      pool = pool.filter(
        (issue) => issue.status === "in-progress" || issue.status === "todo",
      );
    } else if (view === "backlog") {
      pool = pool.filter((issue) => issue.status === "backlog");
    } else if (view === "done") {
      pool = pool.filter((issue) => issue.status === "done");
    }
    if (filters.statuses.length > 0) {
      pool = pool.filter((issue) => filters.statuses.includes(issue.status));
    }
    if (filters.priorities.length > 0) {
      pool = pool.filter((issue) =>
        filters.priorities.includes(issue.priority),
      );
    }
    if (filters.assigneeIds.length > 0) {
      pool = pool.filter(
        (issue) =>
          issue.assignedTo &&
          filters.assigneeIds.includes(issue.assignedTo.id),
      );
    }
    if (filters.projectIds.length > 0) {
      pool = pool.filter(
        (issue) =>
          issue.projectId !== null &&
          issue.projectId !== undefined &&
          filters.projectIds.includes(issue.projectId),
      );
    }
    if (filters.labelIds.length > 0) {
      pool = pool.filter((issue) =>
        (issue.labels ?? []).some((l) => filters.labelIds.includes(l.id)),
      );
    }
    return pool;
  }, [issues, view, filters]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string | null }>)
        .detail;
      if (!detail?.userId) return;
      setFilters((current) => ({
        ...current,
        assigneeIds: current.assigneeIds.includes(detail.userId!)
          ? current.assigneeIds
          : [...current.assigneeIds, detail.userId!],
      }));
    };
    window.addEventListener("produktive:filter-mine", handler);
    return () => window.removeEventListener("produktive:filter-mine", handler);
  }, []);

  const counts = useMemo(
    () => ({
      all: issues.length,
      active: issues.filter(
        (issue) => issue.status === "in-progress" || issue.status === "todo",
      ).length,
      backlog: issues.filter((issue) => issue.status === "backlog").length,
      done: issues.filter((issue) => issue.status === "done").length,
    }),
    [issues],
  );

  const onSelect = (id: string, event?: MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey)) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClickedId(id);
      return;
    }
    if (event && event.shiftKey && lastClickedId) {
      const startIdx = filteredIssues.findIndex(
        (i) => i.id === lastClickedId,
      );
      const endIdx = filteredIssues.findIndex((i) => i.id === id);
      if (startIdx >= 0 && endIdx >= 0) {
        const [a, b] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const range = filteredIssues.slice(a, b + 1).map((i) => i.id);
        setSelectedIds((current) => new Set([...current, ...range]));
        setLastClickedId(id);
        return;
      }
    }
    if (selectedIds.size > 0) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClickedId(id);
      return;
    }
    setLastClickedId(id);
    void navigate({ to: "/issues/$issueId", params: { issueId: id } });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  };

  const toggleIssueSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedId(id);
  };

  const allFilteredSelected =
    filteredIssues.length > 0 &&
    filteredIssues.every((issue) => selectedIds.has(issue.id));

  const toggleAllFiltered = () => {
    if (filteredIssues.length === 0) return;
    setSelectedIds((current) => {
      if (allFilteredSelected) {
        const next = new Set(current);
        for (const issue of filteredIssues) {
          next.delete(issue.id);
        }
        return next;
      }
      return new Set([...current, ...filteredIssues.map((issue) => issue.id)]);
    });
    setLastClickedId(filteredIssues[0]?.id ?? null);
  };

  const handleBulkSetStatus = async (status: string) => {
    const ids = Array.from(selectedIds);
    const previousStatuses = new Map(
      issues
        .filter((issue) => ids.includes(issue.id))
        .map((issue) => [issue.id, issue.status]),
    );
    clearSelection();
    for (const id of ids) {
      updateIssueLocal(id, { status });
    }
    const failures: string[] = [];
    for (const id of ids) {
      try {
        const response = await updateIssue(id, { status });
        updateIssueLocal(id, response.issue);
      } catch {
        failures.push(id);
        const previous = previousStatuses.get(id);
        if (previous) updateIssueLocal(id, { status: previous });
      }
    }
    if (failures.length === 0) {
      toast.success(`Moved ${ids.length} to ${statusLabel[status] ?? status}`);
    } else {
      toast.error(`Failed for ${failures.length} issue(s)`);
    }
  };

  const handleBulkSetPriority = async (priority: string) => {
    const ids = Array.from(selectedIds);
    const previousPriorities = new Map(
      issues
        .filter((issue) => ids.includes(issue.id))
        .map((issue) => [issue.id, issue.priority]),
    );
    clearSelection();
    for (const id of ids) {
      updateIssueLocal(id, { priority });
    }
    const failures: string[] = [];
    for (const id of ids) {
      try {
        const response = await updateIssue(id, { priority });
        updateIssueLocal(id, response.issue);
      } catch {
        failures.push(id);
        const previous = previousPriorities.get(id);
        if (previous) updateIssueLocal(id, { priority: previous });
      }
    }
    if (failures.length === 0) {
      toast.success(`Updated priority for ${ids.length}`);
    } else {
      toast.error(`Failed for ${failures.length} issue(s)`);
    }
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    confirm({
      title: `Delete ${ids.length} issue${ids.length === 1 ? "" : "s"}?`,
      description: "This can't be undone.",
      confirmLabel: `Delete ${ids.length === 1 ? "issue" : "all"}`,
      destructive: true,
      onConfirm: async () => {
        clearSelection();
        const failures: string[] = [];
        for (const id of ids) {
          try {
            await deleteIssue(id);
            removeIssueLocal(id);
          } catch {
            failures.push(id);
          }
        }
        if (failures.length === 0) {
          toast.success(`Deleted ${ids.length}`);
        } else {
          toast.error(`Failed to delete ${failures.length}`);
        }
      },
    });
  };

  useEffect(() => {
    if (issueId) return;
    if (filteredIssues.length === 0) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedId((current) => {
          const idx = current
            ? filteredIssues.findIndex((i) => i.id === current)
            : -1;
          const next =
            filteredIssues[Math.min(filteredIssues.length - 1, idx + 1)];
          return next?.id ?? filteredIssues[0]?.id ?? null;
        });
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedId((current) => {
          const idx = current
            ? filteredIssues.findIndex((i) => i.id === current)
            : 0;
          const next = filteredIssues[Math.max(0, idx - 1)];
          return next?.id ?? filteredIssues[0]?.id ?? null;
        });
      } else if (event.key === "Enter" && focusedId) {
        event.preventDefault();
        onSelect(focusedId);
      } else if (event.key === "x" && focusedId) {
        event.preventDefault();
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(focusedId)) next.delete(focusedId);
          else next.add(focusedId);
          return next;
        });
      } else if (event.key === "Escape") {
        if (selectedIds.size > 0) {
          event.preventDefault();
          clearSelection();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [issueId, filteredIssues, focusedId, selectedIds]);

  useEffect(() => {
    if (!focusedId) return;
    const el = document.querySelector(`[data-issue-row="${focusedId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  if (issueId) {
    const idx = filteredIssues.findIndex((i) => i.id === issueId);
    const siblings = {
      position: idx >= 0 ? idx + 1 : null,
      total: filteredIssues.length,
      prevId: idx > 0 ? filteredIssues[idx - 1].id : null,
      nextId:
        idx >= 0 && idx < filteredIssues.length - 1
          ? filteredIssues[idx + 1].id
          : null,
    };
    return <IssueDetail key={issueId} issueId={issueId} siblings={siblings} />;
  }

  const handleCreateInGroup = async (status: string, title: string) => {
    try {
      const response = await createIssue({ title, status });
      addIssue(response.issue);
      toast.success("Issue created");
    } catch (createError) {
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Failed to create issue",
      );
    }
  };

  const handleMoveToStatus = async (movingId: string, nextStatus: string) => {
    const previous = issues.find((issue) => issue.id === movingId)?.status;
    if (!previous || previous === nextStatus) return;

    updateIssueLocal(movingId, { status: nextStatus });
    try {
      const response = await updateIssue(movingId, { status: nextStatus });
      updateIssueLocal(movingId, response.issue);
      toast.success(`Moved to ${statusLabel[nextStatus] ?? nextStatus}`);
    } catch (moveError) {
      updateIssueLocal(movingId, { status: previous });
      toast.error(
        moveError instanceof Error ? moveError.message : "Failed to move issue",
      );
    }
  };

  return (
    <>
      {confirmDialog}
      <header
        className={cn(
          "sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur",
          "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-gradient-to-b after:from-bg/60 after:to-transparent",
        )}
      >
        <div className="flex items-center gap-2">
          <IssuesIcon size={14} className="text-fg-muted" />
          <h1 className="text-sm font-medium text-fg">Issues</h1>
          <span className="text-xs text-fg-muted tabular-nums">
            {filteredIssues.length}
          </span>
          <button
            type="button"
            onClick={toggleViewFavorited}
            aria-label={viewFavorited ? "Unstar view" : "Star view"}
            className={cn(
              "ml-0.5 grid size-5 place-items-center rounded-[4px] transition-colors hover:bg-surface",
              viewFavorited
                ? "text-warning"
                : "text-fg-faint hover:text-fg",
            )}
          >
            <StarIcon size={12} filled={viewFavorited} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-fg-faint sm:inline">
            Press{" "}
            <kbd className="rounded border border-border bg-surface px-1 font-mono text-[10px]">
              C
            </kbd>{" "}
            to create
          </span>
          <NewIssueDialog
            shortcutEnabled
            onCreated={(issue) => {
              addIssue(issue);
              onboarding.signal("issue-created");
            }}
          />
        </div>
      </header>

      <nav className="flex items-center gap-1 border-b border-border-subtle bg-bg px-5 py-2">
        <div className="flex flex-1 items-center gap-1">
        {viewKeys.map((key) => {
          const isActive = view === key;
          const dropStatus = viewDropStatus[key];
          const isDropping = dragOverView === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              onDragOver={(event) => {
                if (!dropStatus) return;
                if (!event.dataTransfer.types.includes(ISSUE_DRAG_MIME)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOverView !== key) setDragOverView(key);
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  return;
                }
                if (dragOverView === key) setDragOverView(null);
              }}
              onDrop={(event) => {
                if (!dropStatus) return;
                const issueId = event.dataTransfer.getData(ISSUE_DRAG_MIME);
                setDragOverView(null);
                if (!issueId) return;
                event.preventDefault();
                void handleMoveToStatus(issueId, dropStatus);
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                isDropping
                  ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                  : isActive
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              <span>{viewLabels[key]}</span>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isDropping ? "text-accent" : "text-fg-faint",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
        </div>
        <IssueToolbar
          displayOptions={displayOptions}
          onDisplayChange={updateDisplay}
          onPropertiesChange={updateProperties}
          filters={filters}
          onFiltersChange={setFilters}
        />
        {effectiveViewMode === "list" && filteredIssues.length > 0 ? (
          <button
            type="button"
            onClick={toggleAllFiltered}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
              allFilteredSelected
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border-subtle text-fg-muted hover:border-border hover:bg-surface hover:text-fg",
            )}
          >
            <span
              className={cn(
                "grid size-3.5 place-items-center rounded-[3px] border",
                allFilteredSelected
                  ? "border-accent bg-accent text-bg"
                  : "border-border text-transparent",
              )}
            >
              <SelectCheckIcon />
            </span>
            <span>{allFilteredSelected ? "Clear" : "Select all"}</span>
          </button>
        ) : null}
      </nav>
      <IssueFilterChips filters={filters} onChange={setFilters} />

      <section data-tour="issue-list">
        {error ? (
          <div className="m-5 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <span>{error}</span>
            <button
              className="text-fg-muted hover:text-fg transition-colors"
              onClick={dismissError}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <DashboardSkeleton />
        ) : issues.length === 0 ? (
          <EmptyState />
        ) : filteredIssues.length === 0 ? (
          <EmptyView view={view} onSwitchView={setView} />
        ) : (
          effectiveViewMode === "board" ? (
            <IssueBoard
              issues={filteredIssues}
              onSelect={onSelect}
              onMoveToStatus={handleMoveToStatus}
              onCreateInGroup={handleCreateInGroup}
            />
          ) : (
            <IssueList
              issues={filteredIssues}
              selectedId={null}
              focusedId={focusedId}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggleSelected={toggleIssueSelected}
              onMoveToStatus={handleMoveToStatus}
              onCreateInGroup={handleCreateInGroup}
              isFavorite={(id) => isFavorite("issue", id)}
              onToggleFavorite={handleToggleFavorite}
              displayOptions={displayOptions}
            />
          )
        )}
      </section>
      {selectedIds.size > 0 ? (
        <BulkActionBar
          count={selectedIds.size}
          onSetStatus={(status) => void handleBulkSetStatus(status)}
          onSetPriority={(priority) => void handleBulkSetPriority(priority)}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      ) : (
        <AskDock />
      )}
    </>
  );
}

function AskDock() {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 hidden lg:block">
      <Link
        to="/chat"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg/80 px-3 py-1.5 text-[12px] text-fg-muted shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:border-border hover:text-fg"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M2.5 7.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0"
          />
          <path
            d="M11.5 7c0 2.5-2 4.5-4.5 4.5-.7 0-1.4-.15-2-.4l-2.5.9.9-2.5C2.65 8.4 2.5 7.7 2.5 7 2.5 4.5 4.5 2.5 7 2.5s4.5 2 4.5 4.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Ask Produktive</span>
      </Link>
    </div>
  );
}

function SelectCheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 6.2l2 2L9 3.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyView({
  view,
  onSwitchView,
}: {
  view: View;
  onSwitchView: (next: View) => void;
}) {
  const suggestion: Record<View, View> = {
    all: "active",
    active: "all",
    backlog: "all",
    done: "all",
  };
  const target = suggestion[view];
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm text-fg">
        No {viewLabels[view].toLowerCase()}.
      </p>
      <p className="mt-1 text-xs text-fg-muted">
        Try{" "}
        <button
          type="button"
          onClick={() => onSwitchView(target)}
          className="text-accent transition-colors hover:text-accent-hover"
        >
          {viewLabels[target]}
        </button>
        .
      </p>
    </div>
  );
}
