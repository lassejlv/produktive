import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AttachIcon, StarIcon } from "@/components/chat/icons";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Avatar } from "@/components/issue/avatar";
import { PillSelect } from "@/components/issue/pill-select";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { Button } from "@/components/ui/button";
import {
  apiPath,
  type Issue,
  type IssueAttachment,
  type IssueComment,
  type IssueHistoryChange,
  type IssueHistoryEvent,
  createIssueComment,
  deleteIssue,
  getIssue,
  getIssueHistory,
  listIssueComments,
  updateIssue,
  uploadIssueAttachment,
} from "@/lib/api";
import { formatBytes, prepareChatAttachments } from "@/lib/chat-attachments";
import {
  formatDate,
  priorityOptions,
  statusOptions,
} from "@/lib/issue-constants";
import { useFavorites } from "@/lib/use-favorites";
import { cn } from "@/lib/utils";

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
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const pinned = isFavorite("issue", issueId);

  const loadIssueData = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const [issueResponse, historyResponse, commentsResponse] =
        await Promise.all([
          getIssue(issueId),
          getIssueHistory(issueId),
          listIssueComments(issueId),
        ]);
      setIssue(issueResponse.issue);
      setHistory(historyResponse.events);
      setComments(commentsResponse.comments);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load issue",
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadIssueData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  useEffect(() => {
    const source = new EventSource(
      apiPath(
        `/api/realtime?channel=issueSystem&id=${encodeURIComponent(issueId)}`,
      ),
      { withCredentials: true },
    );

    source.addEventListener("refresh", () => {
      void loadIssueData(false);
    });
    source.addEventListener("deleted", () => {
      toast.message("Issue was deleted");
      void navigate({ to: "/issues" });
    });

    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId, navigate]);

  const timeline = useMemo(
    () => buildTimeline(history, comments),
    [history, comments],
  );

  const reloadAfterChange = async () => {
    await loadIssueData(false);
  };

  const handleTogglePin = async () => {
    try {
      await toggleFavorite("issue", issueId);
      toast.success(pinned ? "Removed from favorites" : "Pinned to sidebar");
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const handleStatus = async (next: string) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, status: next });

    try {
      const response = await updateIssue(issue.id, { status: next });
      setIssue(response.issue);
      await reloadAfterChange();
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
      await reloadAfterChange();
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

  const handleComment = async () => {
    if (!issue) return;
    const body = commentBody.trim();
    if (!body) return;

    setIsCommenting(true);
    setError(null);
    try {
      const response = await createIssueComment(issue.id, body);
      setComments((current) => [...current, response.comment]);
      setCommentBody("");
      await reloadAfterChange();
    } catch (commentError) {
      const message =
        commentError instanceof Error ? commentError.message : "Failed to post comment";
      setError(message);
      toast.error(message);
    } finally {
      setIsCommenting(false);
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
      await reloadAfterChange();
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
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
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
        </div>
        {issue ? (
          <button
            type="button"
            onClick={() => void handleTogglePin()}
            className={cn(
              "grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg active:scale-[0.98]",
              pinned && "text-warning",
            )}
            aria-label={pinned ? "Unpin issue" : "Pin issue"}
          >
            <StarIcon size={12} filled={pinned} />
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="mx-auto mt-5 flex max-w-6xl items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button
            className="text-fg-muted transition-colors hover:text-fg"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <IssueDetailSkeleton />
      ) : !issue ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm text-fg">Issue not found.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/issues">Back to issues</Link>
          </Button>
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0 animate-fade-in">
            <div className="border-b border-border-subtle pb-7">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-faint">
                <span>{issue.createdBy?.name ?? "Unknown user"}</span>
                <span>/</span>
                <span>Created {formatDate(issue.createdAt)}</span>
                <span>/</span>
                <span>Updated {formatDate(issue.updatedAt)}</span>
              </div>
              <h1 className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.02em] text-fg">
                {issue.title}
              </h1>
              <div className="mt-5 max-w-3xl text-sm leading-relaxed text-fg-muted">
                {issue.description ? (
                  <ChatMarkdown content={issue.description} />
                ) : (
                  <p className="m-0 text-fg-faint">No description.</p>
                )}
              </div>
            </div>

            <section className="py-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-fg">Activity</h2>
                <span className="text-[11px] text-fg-faint">
                  Live via issueSystem
                </span>
              </div>
              <div className="mt-4">
                <IssueTimeline items={timeline} />
              </div>
            </section>

            <section className="border-t border-border-subtle pt-5">
              <CommentComposer
                value={commentBody}
                disabled={isCommenting}
                onChange={setCommentBody}
                onSubmit={() => void handleComment()}
              />
            </section>
          </section>

          <aside className="animate-fade-in lg:sticky lg:top-16 lg:self-start">
            <div className="rounded-lg border border-border-subtle bg-bg">
              <PropertyRow label="Status">
                <PillSelect
                  ariaLabel="Status"
                  value={issue.status}
                  onChange={(next) => void handleStatus(next)}
                  options={statusOptions}
                  icon={<StatusIcon status={issue.status} />}
                />
              </PropertyRow>
              <PropertyRow label="Priority">
                <PillSelect
                  ariaLabel="Priority"
                  value={issue.priority}
                  onChange={(next) => void handlePriority(next)}
                  options={priorityOptions}
                  icon={<PriorityIcon priority={issue.priority} />}
                />
              </PropertyRow>
              <PropertyRow label="Assignee">
                {issue.assignedTo ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-xs text-fg">
                    <Avatar
                      name={issue.assignedTo.name}
                      image={issue.assignedTo.image}
                    />
                    <span className="truncate">{issue.assignedTo.name}</span>
                  </span>
                ) : (
                  <span className="text-xs text-fg-muted">Unassigned</span>
                )}
              </PropertyRow>
              <PropertyRow label="Created by">
                {issue.createdBy ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-xs text-fg">
                    <Avatar
                      name={issue.createdBy.name}
                      image={issue.createdBy.image}
                    />
                    <span className="truncate">{issue.createdBy.name}</span>
                  </span>
                ) : (
                  <span className="text-xs text-fg-muted">Unknown</span>
                )}
              </PropertyRow>
            </div>

            <section className="mt-4 rounded-lg border border-border-subtle bg-bg">
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2.5">
                <h2 className="text-sm font-medium text-fg">Files</h2>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-60"
                >
                  {isUploading ? (
                    <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" />
                  ) : (
                    <AttachIcon />
                  )}
                  Attach
                </button>
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDelete()}
              className="mt-4 w-full justify-center text-danger hover:text-danger"
            >
              Delete issue
            </Button>
          </aside>
        </div>
      )}
    </main>
  );
}

type TimelineItem =
  | { type: "event"; date: string; event: IssueHistoryEvent }
  | { type: "comment"; date: string; comment: IssueComment };

function buildTimeline(
  events: IssueHistoryEvent[],
  comments: IssueComment[],
): TimelineItem[] {
  return [
    ...events.map((event) => ({
      type: "event" as const,
      date: event.createdAt,
      event,
    })),
    ...comments.map((comment) => ({
      type: "comment" as const,
      date: comment.createdAt,
      comment,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function IssueTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle px-4 py-5 text-sm text-fg-faint">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[10px] top-2 h-[calc(100%-16px)] w-px bg-border-subtle" />
      <div className="grid gap-5">
        {items.map((item) =>
          item.type === "comment" ? (
            <CommentTimelineItem key={`comment-${item.comment.id}`} comment={item.comment} />
          ) : (
            <EventTimelineItem key={`event-${item.event.id}`} event={item.event} />
          ),
        )}
      </div>
    </div>
  );
}

function CommentTimelineItem({ comment }: { comment: IssueComment }) {
  return (
    <article className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-3">
      <span className="relative z-[1] mt-1 grid size-[21px] place-items-center rounded-full border border-border-subtle bg-bg">
        <Avatar name={comment.author?.name} image={comment.author?.image} />
      </span>
      <div className="min-w-0 rounded-lg border border-border-subtle bg-bg px-4 py-3 transition-colors hover:border-border">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-fg">
            {comment.author?.name ?? "Unknown user"}
          </span>
          <span className="text-[11px] text-fg-faint">
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <div className="mt-2 text-sm leading-relaxed text-fg-muted">
          <ChatMarkdown content={comment.body} />
        </div>
      </div>
    </article>
  );
}

function EventTimelineItem({ event }: { event: IssueHistoryEvent }) {
  return (
    <article className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-3">
      <span className="relative z-[1] mt-1 grid size-[21px] place-items-center rounded-full border border-border-subtle bg-bg">
        <span className="size-1.5 rounded-full bg-fg-faint" />
      </span>
      <div className="min-w-0 py-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-fg">
            {event.actor?.name ?? "Unknown user"}
          </span>
          <span className="text-fg-muted">{eventActionLabel(event.action)}</span>
          <span className="text-[11px] text-fg-faint">
            {formatDate(event.createdAt)}
          </span>
        </div>
        {event.changes.length > 0 ? (
          <div className="mt-2 grid gap-1.5">
            {event.changes.map((change, index) => (
              <IssueChangeView key={`${change.field}-${index}`} change={change} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function IssueChangeView({ change }: { change: IssueHistoryChange }) {
  const label = fieldLabel(change.field);

  if (change.field === "attachments") {
    return (
      <p className="text-xs text-fg-muted">
        Attached <span className="font-mono text-fg">{attachmentName(change.after)}</span>
      </p>
    );
  }

  if (
    change.field === "description" ||
    longValue(change.before) ||
    longValue(change.after)
  ) {
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

  return (
    <p className="text-xs text-fg-muted">
      {label} from{" "}
      <span className="font-mono text-fg">{displayValue(change.before)}</span>{" "}
      to <span className="font-mono text-fg">{displayValue(change.after)}</span>
    </p>
  );
}

function DiffBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border border-border-subtle bg-surface">
      <p className="border-b border-border-subtle px-2 py-1 text-[11px] text-fg-faint">
        {label}
      </p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px] leading-relaxed text-fg-muted">
        {displayValue(value)}
      </pre>
    </div>
  );
}

function CommentComposer({
  value,
  disabled,
  onChange,
  onSubmit,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg p-3">
      <label className="sr-only" htmlFor="issue-comment">
        Comment
      </label>
      <textarea
        id="issue-comment"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Leave a comment..."
        rows={4}
        className="min-h-24 w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
      />
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <span className="text-[11px] text-fg-faint">Markdown supported</span>
        <Button
          type="button"
          size="sm"
          disabled={disabled || value.trim().length === 0}
          onClick={onSubmit}
        >
          {disabled ? "Posting..." : "Comment"}
        </Button>
      </div>
    </div>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="min-w-0 justify-self-end">{children}</div>
    </div>
  );
}

function IssueAttachmentList({
  attachments,
}: {
  attachments: IssueAttachment[];
}) {
  if (attachments.length === 0) {
    return <div className="px-3 py-4 text-sm text-fg-faint">No files.</div>;
  }

  return (
    <div className="divide-y divide-border-subtle">
      {attachments.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="block transition-colors hover:bg-surface"
        >
          {file.contentType.startsWith("image/") ? (
            <figure className="m-0">
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="max-h-52 w-full object-contain"
              />
              <figcaption className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2">
                <span className="truncate font-mono text-[11px] text-fg-muted">
                  {file.name}
                </span>
                <span className="font-mono text-[11px] text-fg-faint">
                  {formatBytes(file.size)}
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
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

function IssueDetailSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="animate-pulse border-b border-border-subtle pb-7">
        <div className="h-3 w-56 rounded bg-surface" />
        <div className="mt-4 h-8 w-2/3 rounded bg-surface" />
        <div className="mt-6 grid max-w-3xl gap-2">
          <div className="h-3 rounded bg-surface" />
          <div className="h-3 w-4/5 rounded bg-surface" />
        </div>
      </div>
      <div className="hidden animate-pulse rounded-lg border border-border-subtle bg-bg lg:block">
        <div className="h-10 border-b border-border-subtle" />
        <div className="h-10 border-b border-border-subtle" />
        <div className="h-10" />
      </div>
    </div>
  );
}

function eventActionLabel(action: string) {
  if (action === "created") return "created this issue";
  if (action === "attachment_added") return "attached a file";
  if (action === "updated") return "updated this issue";
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
  const displayed = displayValue(value);
  return displayed.length > 80 || displayed.includes("\n");
}

function attachmentName(value: unknown) {
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "file";
}
