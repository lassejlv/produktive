import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AttachIcon, StarIcon } from "@/components/chat/icons";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Avatar } from "@/components/issue/avatar";
import { PillSelect } from "@/components/issue/pill-select";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { Button } from "@/components/ui/button";
import {
  type IssueAttachment,
  type IssueHistoryChange,
  type IssueHistoryEvent,
  type Issue,
  deleteIssue,
  getIssueHistory,
  getIssue,
  updateIssue,
  uploadIssueAttachment,
} from "@/lib/api";
import { formatBytes, prepareChatAttachments } from "@/lib/chat-attachments";
import { useFavorites } from "@/lib/use-favorites";
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
  return <IssueDetail issueId={issueId} />;
}

export function IssueDetail({ issueId }: { issueId: string }) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [history, setHistory] = useState<IssueHistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const pinned = isFavorite("issue", issueId);

  const handleTogglePin = async () => {
    try {
      await toggleFavorite("issue", issueId);
      toast.success(pinned ? "Removed from favorites" : "Pinned to sidebar");
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [issueResponse, historyResponse] = await Promise.all([
          getIssue(issueId),
          getIssueHistory(issueId),
        ]);
        if (isMounted) {
          setIssue(issueResponse.issue);
          setHistory(historyResponse.events);
        }
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

  const reloadHistory = async (id: string) => {
    try {
      const response = await getIssueHistory(id);
      setHistory(response.events);
    } catch (historyError) {
      toast.error(
        historyError instanceof Error
          ? historyError.message
          : "Failed to load issue history",
      );
    }
  };

  const handleStatus = async (next: string) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, status: next });

    try {
      const response = await updateIssue(issue.id, { status: next });
      setIssue(response.issue);
      await reloadHistory(issue.id);
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
      const response = await updateIssue(issue.id, { priority: next });
      setIssue(response.issue);
      await reloadHistory(issue.id);
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

  const handleAttachmentChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (!issue || !event.target.files?.length) return;

    const result = prepareChatAttachments(
      event.target.files,
      issue.attachments?.length ?? 0,
    );
    event.target.value = "";

    if (result.errors.length > 0) {
      setError(result.errors[0] ?? "Failed to attach files");
      toast.error(result.errors[0] ?? "Failed to attach files");
    }

    if (result.attachments.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      let nextIssue = issue;
      for (const draft of result.attachments) {
        const response = await uploadIssueAttachment(nextIssue.id, draft.file);
        nextIssue = response.issue;
      }
      setIssue(nextIssue);
      await reloadHistory(nextIssue.id);
      toast.success(
        result.attachments.length === 1
          ? "File attached"
          : `${result.attachments.length} files attached`,
      );
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload attachment";
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
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
            <div className="mt-4 text-sm leading-relaxed text-fg-muted">
              <ChatMarkdown content={issue.description} />
            </div>
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

          <section className="mt-5 rounded-lg border border-border-subtle bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">
                Attachments
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" />
                ) : (
                  <AttachIcon />
                )}
                Attach files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => void handleAttachmentChange(event)}
              />
            </div>
            <IssueAttachmentList attachments={issue.attachments ?? []} />
          </section>

          <section className="mt-5 rounded-lg border border-border-subtle bg-surface">
            <p className="border-b border-border-subtle px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
              Activity
            </p>
            <IssueHistoryList events={history} />
          </section>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTogglePin()}
              className={pinned ? "text-warning" : undefined}
            >
              <StarIcon size={12} filled={pinned} />
              {pinned ? "Unpin" : "Pin to sidebar"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
              Delete issue
            </Button>
          </div>
        </article>
      )}
    </>
  );
}

function IssueHistoryList({ events }: { events: IssueHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="px-4 py-5 text-sm text-fg-faint">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="grid gap-px bg-border-subtle">
      {events.map((event) => (
        <div key={event.id} className="bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-medium text-fg">
              {event.actor?.name ?? "Unknown user"}
            </span>
            <span className="text-fg-muted">{eventActionLabel(event.action)}</span>
            <span className="font-mono text-[11px] text-fg-faint">
              {formatDate(event.createdAt)}
            </span>
          </div>
          {event.changes.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {event.changes.map((change, index) => (
                <IssueChangeView key={`${change.field}-${index}`} change={change} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function IssueChangeView({ change }: { change: IssueHistoryChange }) {
  const label = fieldLabel(change.field);

  if (change.field === "description" || longValue(change.before) || longValue(change.after)) {
    return (
      <details className="rounded-md border border-border-subtle bg-bg px-3 py-2">
        <summary className="cursor-pointer select-none text-xs text-fg-muted">
          Changed {label}
        </summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <DiffBlock label="Before" value={change.before} />
          <DiffBlock label="After" value={change.after} />
        </div>
      </details>
    );
  }

  if (change.field === "attachments") {
    const attachment = attachmentName(change.after);
    return (
      <p className="text-xs text-fg-muted">
        Attached <span className="font-mono text-fg">{attachment}</span>
      </p>
    );
  }

  return (
    <p className="text-xs text-fg-muted">
      {label} changed from{" "}
      <span className="font-mono text-fg">{displayValue(change.before)}</span>{" "}
      to <span className="font-mono text-fg">{displayValue(change.after)}</span>
    </p>
  );
}

function DiffBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border border-border-subtle bg-surface">
      <p className="border-b border-border-subtle px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
        {label}
      </p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px] leading-relaxed text-fg-muted">
        {displayValue(value)}
      </pre>
    </div>
  );
}

function eventActionLabel(action: string) {
  if (action === "created") return "created the issue";
  if (action === "attachment_added") return "attached a file";
  if (action === "updated") return "updated the issue";
  return action.split("_").join(" ");
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    assignedToId: "Assignee",
    attachments: "Attachments",
  };
  return labels[field] ?? field;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function longValue(value: unknown) {
  return displayValue(value).length > 80 || displayValue(value).includes("\n");
}

function attachmentName(value: unknown) {
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "file";
}

function IssueAttachmentList({
  attachments,
}: {
  attachments: IssueAttachment[];
}) {
  if (attachments.length === 0) {
    return (
      <div className="px-4 py-5 text-sm text-fg-faint">
        No files attached.
      </div>
    );
  }

  return (
    <div className="grid gap-px bg-border-subtle">
      {attachments.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="block bg-surface transition-colors hover:bg-surface-2"
        >
          {file.contentType.startsWith("image/") ? (
            <figure className="m-0">
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="max-h-[420px] w-full object-contain"
              />
              <figcaption className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2.5">
                <span className="truncate font-mono text-[11px] text-fg-muted">
                  {file.name}
                </span>
                <span className="font-mono text-[11px] text-fg-faint">
                  {formatBytes(file.size)}
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="m-0 truncate font-mono text-[12px] leading-tight text-fg">
                  {file.name}
                </p>
                <p className="m-0 mt-1 truncate font-mono text-[11px] leading-tight text-fg-faint">
                  {file.contentType || "application/octet-stream"}
                </p>
              </div>
              <span className="font-mono text-[11px] text-fg-muted">
                {formatBytes(file.size)}
              </span>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
