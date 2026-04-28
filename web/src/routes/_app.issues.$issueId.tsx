import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AttachIcon, DotsIcon, StarIcon } from "@/components/chat/icons";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Avatar } from "@/components/issue/avatar";
import { EditableDescription } from "@/components/issue/editable-description";
import { EditableTitle } from "@/components/issue/editable-title";
import { IssueMetaStrip } from "@/components/issue/issue-meta-strip";
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
import { formatDate } from "@/lib/issue-constants";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const pinned = isFavorite("issue", issueId);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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

  const handleTitle = async (next: string) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, title: next });
    try {
      const response = await updateIssue(issue.id, { title: next });
      setIssue(response.issue);
      await reloadAfterChange();
    } catch (updateError) {
      setIssue(previous);
      const message =
        updateError instanceof Error ? updateError.message : "Failed to update title";
      setError(message);
      toast.error(message);
    }
  };

  const handleDescription = async (next: string) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, description: next || null });
    try {
      const response = await updateIssue(issue.id, { description: next });
      setIssue(response.issue);
      await reloadAfterChange();
    } catch (updateError) {
      setIssue(previous);
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Failed to update description";
      setError(message);
      toast.error(message);
    }
  };

  const handleAssignee = async (memberId: string | null) => {
    if (!issue) return;
    const previous = issue;
    setIssue({
      ...issue,
      assignedTo: memberId
        ? issue.assignedTo && issue.assignedTo.id === memberId
          ? issue.assignedTo
          : null
        : null,
    });
    try {
      const response = await updateIssue(issue.id, {
        assignedToId: memberId,
      });
      setIssue(response.issue);
      await reloadAfterChange();
    } catch (updateError) {
      setIssue(previous);
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Failed to update assignee";
      setError(message);
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!issue) return;
    if (!window.confirm("Delete this issue? This can't be undone.")) return;
    try {
      await deleteIssue(issue.id);
      void navigate({ to: "/issues" });
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Failed to delete issue";
      setError(message);
      toast.error(message);
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
      <header className="flex items-center justify-between gap-3 px-6 pt-5">
        <Link
          to="/issues"
          className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint transition-colors hover:text-fg-muted"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 3l-4 4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to issues
        </Link>
        {issue ? (
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void handleAttachmentChange(event)}
            />
            <HeaderIconButton
              title={pinned ? "Unpin issue" : "Pin issue"}
              onClick={() => void handleTogglePin()}
              active={pinned}
              activeClass="text-warning"
            >
              <StarIcon size={12} filled={pinned} />
            </HeaderIconButton>
            <HeaderIconButton
              title="Attach files"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" />
              ) : (
                <AttachIcon size={12} />
              )}
            </HeaderIconButton>
            <div ref={menuRef} className="relative">
              <HeaderIconButton
                title="More"
                active={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <DotsIcon size={12} />
              </HeaderIconButton>
              {menuOpen ? (
                <div className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                  <button
                    type="button"
                    className="flex h-8 w-full items-center px-2.5 text-left text-[12.5px] text-danger transition-colors hover:bg-surface-2"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleDelete();
                    }}
                  >
                    Delete issue
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="mx-auto mt-4 flex w-full max-w-[760px] items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
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
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-sm text-fg">Issue not found.</p>
          <Link
            to="/issues"
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-fg-muted transition-colors hover:text-fg"
          >
            ← Back to issues
          </Link>
        </div>
      ) : (
        <article className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-10 animate-fade-in">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-faint">
            P-{issue.id.slice(0, 4).toUpperCase()}
          </p>
          <EditableTitle value={issue.title} onSave={handleTitle} />

          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-fg-faint">
            {issue.createdBy ? (
              <span className="inline-flex items-center gap-1.5 text-fg-muted">
                <Avatar
                  name={issue.createdBy.name}
                  image={issue.createdBy.image}
                />
                {issue.createdBy.name}
              </span>
            ) : null}
            {issue.createdBy ? <span className="text-fg-faint/60">·</span> : null}
            <span>Created {formatDate(issue.createdAt)}</span>
            <span className="text-fg-faint/60">·</span>
            <span>Updated {formatDate(issue.updatedAt)}</span>
          </div>

          <div className="mt-3">
            <IssueMetaStrip
              status={issue.status}
              priority={issue.priority}
              assignee={
                issue.assignedTo
                  ? {
                      id: issue.assignedTo.id,
                      name: issue.assignedTo.name,
                      image: issue.assignedTo.image,
                    }
                  : null
              }
              onChangeStatus={(next) => void handleStatus(next)}
              onChangePriority={(next) => void handlePriority(next)}
              onChangeAssignee={(id) => void handleAssignee(id)}
            />
          </div>

          <div className="mt-10">
            <EditableDescription
              value={issue.description}
              onSave={handleDescription}
            />
          </div>

          {issue.attachments && issue.attachments.length > 0 ? (
            <section className="mt-12">
              <h2 className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                Attachments
              </h2>
              <AttachmentRail attachments={issue.attachments} />
            </section>
          ) : null}

          <section className="mt-14 border-t border-border-subtle pt-8">
            <h2 className="mb-5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Activity
            </h2>
            <IssueTimeline items={timeline} />
            <div className="mt-6">
              <CommentComposer
                value={commentBody}
                disabled={isCommenting}
                onChange={setCommentBody}
                onSubmit={() => void handleComment()}
              />
            </div>
          </section>
        </article>
      )}
    </main>
  );
}

function HeaderIconButton({
  children,
  title,
  onClick,
  disabled,
  active,
  activeClass,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-[6px] text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-60",
        active && (activeClass ?? "bg-surface text-fg"),
      )}
    >
      {children}
    </button>
  );
}

function AttachmentRail({ attachments }: { attachments: IssueAttachment[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((file) => {
        const isImage = file.contentType.startsWith("image/");
        return (
          <a
            key={file.id}
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex max-w-full items-center gap-2 overflow-hidden rounded-[7px] border border-border-subtle bg-surface/40 transition-colors hover:border-border hover:bg-surface"
          >
            {isImage ? (
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="h-16 w-24 object-cover"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center text-fg-faint">
                <AttachIcon size={14} />
              </span>
            )}
            <span className="flex min-w-0 flex-col py-1 pr-2.5">
              <span className="truncate font-mono text-[11.5px] text-fg">
                {file.name}
              </span>
              <span className="truncate font-mono text-[10px] text-fg-faint">
                {formatBytes(file.size)}
              </span>
            </span>
          </a>
        );
      })}
    </div>
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
      <p className="text-[13px] text-fg-faint">No activity yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {items.map((item) =>
        item.type === "comment" ? (
          <CommentTimelineItem
            key={`comment-${item.comment.id}`}
            comment={item.comment}
          />
        ) : (
          <EventTimelineItem key={`event-${item.event.id}`} event={item.event} />
        ),
      )}
    </div>
  );
}

function CommentTimelineItem({ comment }: { comment: IssueComment }) {
  return (
    <article className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <Avatar name={comment.author?.name} image={comment.author?.image} />
        <span className="font-medium text-fg">
          {comment.author?.name ?? "Unknown user"}
        </span>
        <span className="text-fg-faint">·</span>
        <span className="text-[11.5px] text-fg-faint">
          {formatDate(comment.createdAt)}
        </span>
      </div>
      <div className="pl-7 text-[14px] leading-[1.65] text-fg">
        <ChatMarkdown content={comment.body} />
      </div>
    </article>
  );
}

function EventTimelineItem({ event }: { event: IssueHistoryEvent }) {
  return (
    <article className="flex flex-col gap-0.5 text-[12.5px] text-fg-muted">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg">{event.actor?.name ?? "Unknown user"}</span>
        <span>{eventActionLabel(event.action)}</span>
        <span className="text-fg-faint">·</span>
        <span className="text-[11.5px] text-fg-faint">
          {formatDate(event.createdAt)}
        </span>
      </div>
      {event.changes.length > 0 ? (
        <div className="flex flex-col gap-0.5 text-[12px] text-fg-faint">
          {event.changes.map((change, index) => (
            <IssueChangeView key={`${change.field}-${index}`} change={change} />
          ))}
        </div>
      ) : null}
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
  const empty = value.trim().length === 0;
  return (
    <div className="flex flex-col gap-1.5">
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
        placeholder="Add a comment…"
        rows={2}
        className="min-h-[44px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.65] text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-fg-faint">
          Markdown · ⌘↵ to send
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || empty}
          className={cn(
            "inline-flex h-7 items-center rounded-[6px] px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed",
            empty || disabled
              ? "text-fg-faint"
              : "text-accent hover:bg-accent/10",
          )}
        >
          {disabled ? "Sending…" : "Reply"}
        </button>
      </div>
    </div>
  );
}

function IssueDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[760px] animate-pulse px-6 pb-24 pt-10">
      <div className="h-3 w-12 rounded bg-surface" />
      <div className="mt-3 h-10 w-3/4 rounded bg-surface" />
      <div className="mt-5 h-3 w-64 rounded bg-surface" />
      <div className="mt-3 h-5 w-80 rounded bg-surface" />
      <div className="mt-10 grid gap-2">
        <div className="h-3 w-full rounded bg-surface" />
        <div className="h-3 w-11/12 rounded bg-surface" />
        <div className="h-3 w-3/4 rounded bg-surface" />
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
