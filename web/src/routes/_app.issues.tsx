import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { IssueList } from "@/components/issue/issue-list";
import { NewIssueDialog } from "@/components/issue/new-issue-dialog";
import { DashboardSkeleton } from "@/components/issue-skeleton";
import { type View, viewLabels } from "@/lib/issue-constants";
import { useIssues } from "@/lib/use-issues";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/issues")({
  component: IssuesPage,
});

const viewKeys = Object.keys(viewLabels) as View[];

function IssuesPage() {
  const navigate = useNavigate();
  const { issues, isLoading, error, dismissError, addIssue } = useIssues();
  const [view, setView] = useState<View>("all");

  const filteredIssues = useMemo(() => {
    if (view === "all") return issues;
    if (view === "active") {
      return issues.filter(
        (issue) => issue.status === "in-progress" || issue.status === "todo",
      );
    }
    if (view === "backlog") return issues.filter((issue) => issue.status === "backlog");
    return issues.filter((issue) => issue.status === "done");
  }, [issues, view]);

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

  const onSelect = (issueId: string) => {
    void navigate({ to: "/issues/$issueId", params: { issueId } });
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/80 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-fg">Issues</h1>
          <span className="text-xs text-fg-muted tabular-nums">
            {filteredIssues.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-fg-faint sm:inline">
            Press{" "}
            <kbd className="rounded border border-border bg-surface px-1 font-mono text-[10px]">
              C
            </kbd>{" "}
            to create
          </span>
          <NewIssueDialog shortcutEnabled onCreated={addIssue} />
        </div>
      </header>

      <nav className="flex items-center gap-1 border-b border-border-subtle bg-bg px-5 py-2">
        {viewKeys.map((key) => {
          const isActive = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                isActive
                  ? "bg-surface text-fg"
                  : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              <span>{viewLabels[key]}</span>
              <span className="text-[11px] tabular-nums text-fg-faint">
                {counts[key]}
              </span>
            </button>
          );
        })}
      </nav>

      <section>
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
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm text-fg">
              No {viewLabels[view].toLowerCase()}.
            </p>
            <p className="mt-1 text-xs text-fg-muted">Try a different view.</p>
          </div>
        ) : (
          <IssueList
            issues={filteredIssues}
            selectedId={null}
            onSelect={onSelect}
          />
        )}
      </section>
    </>
  );
}
