import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/issue/avatar";
import { PillSelect } from "@/components/issue/pill-select";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { Button } from "@/components/ui/button";
import {
  type Issue,
  deleteIssue,
  getIssue,
  updateIssue,
} from "@/lib/api";
import {
  formatDate,
  priorityOptions,
  statusOptions,
} from "@/lib/issue-constants";

export const Route = createFileRoute("/_app/issues/$issueId")({
  component: IssueDetailPage,
});

function IssueDetailPage() {
  const { issueId } = Route.useParams();
  const navigate = useNavigate();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getIssue(issueId);
        if (isMounted) setIssue(response.issue);
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load issue",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [issueId]);

  const handleStatus = async (next: string) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, status: next });

    try {
      await updateIssue(issue.id, { status: next });
    } catch (updateError) {
      setIssue(previous);
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update issue",
      );
    }
  };

  const handlePriority = async (next: string) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, priority: next });

    try {
      await updateIssue(issue.id, { priority: next });
    } catch (updateError) {
      setIssue(previous);
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update issue",
      );
    }
  };

  const handleDelete = async () => {
    if (!issue) return;
    try {
      await deleteIssue(issue.id);
      void navigate({ to: "/issues" });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete issue",
      );
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border-subtle bg-bg/80 px-5 backdrop-blur">
        <Link
          to="/issues"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 3l-4 4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Issues
        </Link>
        {issue ? (
          <span className="font-mono text-[11px] text-fg-muted">
            P-{issue.id.slice(0, 4).toUpperCase()}
          </span>
        ) : null}
      </header>

      {error ? (
        <div className="m-5 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button
            className="text-fg-muted hover:text-fg transition-colors"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid place-items-center px-6 py-16 text-fg-muted text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" />
            Loading…
          </div>
        </div>
      ) : !issue ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm text-fg">Issue not found.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/issues">Back to issues</Link>
          </Button>
        </div>
      ) : (
        <article className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
          <h1 className="text-2xl font-semibold text-fg">{issue.title}</h1>
          {issue.description ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
              {issue.description}
            </p>
          ) : (
            <p className="mt-4 text-sm text-fg-faint italic">No description.</p>
          )}

          <section className="mt-10 rounded-lg border border-border-subtle bg-surface">
            <p className="border-b border-border-subtle px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
              Properties
            </p>
            <dl className="grid gap-2 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-fg-muted">Status</dt>
                <dd>
                  <PillSelect
                    ariaLabel="Status"
                    value={issue.status}
                    onChange={(next) => void handleStatus(next)}
                    options={statusOptions}
                    icon={<StatusIcon status={issue.status} />}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-fg-muted">Priority</dt>
                <dd>
                  <PillSelect
                    ariaLabel="Priority"
                    value={issue.priority}
                    onChange={(next) => void handlePriority(next)}
                    options={priorityOptions}
                    icon={<PriorityIcon priority={issue.priority} />}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-fg-muted">Assignee</dt>
                <dd className="text-xs text-fg">
                  {issue.assignedTo ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar
                        name={issue.assignedTo.name}
                        image={issue.assignedTo.image}
                      />
                      {issue.assignedTo.name}
                    </span>
                  ) : (
                    <span className="text-fg-muted">Unassigned</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-fg-muted">Updated</dt>
                <dd className="font-mono text-[11px] text-fg-muted">
                  {formatDate(issue.updatedAt)}
                </dd>
              </div>
            </dl>
          </section>

          <div className="mt-6 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
              Delete issue
            </Button>
          </div>
        </article>
      )}
    </>
  );
}
