import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AttachIcon, StarIcon } from "@/components/chat/icons";
import { Avatar } from "@/components/issue/avatar";
import { EditableDescription } from "@/components/issue/editable-description";
import { EditableTitle } from "@/components/issue/editable-title";
import { IssueProperties } from "@/components/issue/issue-properties";
import { StatusIcon } from "@/components/issue/status-icon";
import {
  SidePane,
  SidePaneBody,
  SidePaneClose,
  SidePaneHeader,
} from "@/components/ui/sidepane";
import { Spinner } from "@/components/ui/spinner";
import {
  type IssueComment,
  type IssueHistoryEvent,
  createIssueComment,
  listMembers,
  uploadIssueAttachment,
} from "@/lib/api";
import { prepareChatAttachments } from "@/lib/chat-attachments";
import { formatDate } from "@/lib/issue-constants";
import { useFavorites } from "@/lib/use-favorites";
import {
  useIssueCommentsQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
} from "@/lib/queries/issues";
import { queryKeys } from "@/lib/queries/keys";
import { useUpdateIssue } from "@/lib/mutations/issues";
import { useLabelsQuery } from "@/lib/queries/labels";
import { useProjectsQuery } from "@/lib/queries/projects";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { useWorkspaceSlug } from "@/lib/use-workspace-slug";
import { cn } from "@/lib/utils";

type Lookups = {
  projects: Map<string, string>;
  members: Map<string, string>;
  labels: Map<string, string>;
};

export function IssueSidepane({
  issueId,
  onClose,
}: {
  issueId: string | null;
  onClose: () => void;
}) {
  return (
    <SidePane open={Boolean(issueId)} onClose={onClose} width={480}>
      {issueId ? <IssueSidepaneContent issueId={issueId} onClose={onClose} /> : null}
    </SidePane>
  );
}

function IssueSidepaneContent({
  issueId,
  onClose,
}: {
  issueId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const workspaceSlug = useWorkspaceSlug();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const issueQuery = useIssueDetailQuery(issueId);
  const historyQuery = useIssueHistoryQuery(issueId);
  const commentsQuery = useIssueCommentsQuery(issueId);
  const projectsQuery = useProjectsQuery();
  const labelsQuery = useLabelsQuery();
  const { statuses } = useIssueStatuses();
  const membersQuery = useQuery({
    queryKey: queryKeys.members,
    queryFn: () => listMembers().then((r) => r.members),
    staleTime: 60_000,
  });

  const issue = issueQuery.data ?? null;
  const history = historyQuery.data ?? [];
  const comments = commentsQuery.data ?? [];

  const _lookups = useMemo<Lookups>(
    () => ({
      projects: new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
      members: new Map((membersQuery.data ?? []).map((m) => [m.id, m.name])),
      labels: new Map((labelsQuery.data ?? []).map((l) => [l.id, l.name])),
    }),
    [projectsQuery.data, membersQuery.data, labelsQuery.data],
  );

  const updateIssueMutation = useUpdateIssue();

  const [commentBody, setCommentBody] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const pinned = isFavorite("issue", issueId);

  useEffect(() => {
    setError(issueQuery.error?.message ?? null);
  }, [issueQuery.error]);

  useEffect(() => {
    setCommentBody("");
    setError(null);
  }, [issueId]);

  const reloadAfterChange = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
      qc.invalidateQueries({ queryKey: queryKeys.issues.history(issueId) }),
      qc.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) }),
    ]);
  };

  const updateField = async (
    patch: Parameters<typeof updateIssueMutation.mutateAsync>[0]["patch"],
    errorLabel: string,
  ) => {
    if (!issue) return;
    try {
      await updateIssueMutation.mutateAsync({ id: issue.id, patch });
      await reloadAfterChange();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : errorLabel;
      setError(message);
      toast.error(message);
    }
  };

  const handleStatus = (next: string) =>
    void updateField({ status: next }, "Failed to update issue");
  const handlePriority = (next: string) =>
    void updateField({ priority: next }, "Failed to update issue");
  const handleTitle = (next: string) => void updateField({ title: next }, "Failed to update title");
  const handleDescription = (next: string) =>
    void updateField({ description: next }, "Failed to update description");
  const handleAssignee = (memberId: string | null) =>
    void updateField({ assignedToId: memberId }, "Failed to update assignee");
  const handleLabels = (labelIds: string[]) =>
    void updateField({ labelIds }, "Failed to update labels");
  const handleProject = (projectId: string | null) =>
    void updateField({ projectId: projectId ?? "" }, "Failed to update project");

  const handleTogglePin = async () => {
    try {
      await toggleFavorite("issue", issueId);
      toast.success(pinned ? "Removed from favorites" : "Pinned to sidebar");
    } catch {
      toast.error("Failed to update favorite");
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
      qc.setQueryData<IssueComment[]>(queryKeys.issues.comments(issue.id), (old) =>
        old ? [...old, response.comment] : [response.comment],
      );
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

  const handleAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!issue || !event.target.files?.length) return;

    const result = prepareChatAttachments(event.target.files, issue.attachments?.length ?? 0);
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
      qc.setQueryData(queryKeys.issues.detail(issue.id), nextIssue);
      await reloadAfterChange();
      toast.success(
        result.attachments.length === 1
          ? "File attached"
          : `${result.attachments.length} files attached`,
      );
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "Failed to upload attachment";
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const recentComments = comments.slice(-3);
  const recentHistory = history.slice(-3);

  const isLoading = issueQuery.isPending;

  return (
    <>
      <SidePaneHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {issue ? (
            <span className="shrink-0">
              <StatusIcon status={issue.status} statuses={statuses} />
            </span>
          ) : (
            <span className="size-3 shrink-0 rounded-full bg-surface-2" />
          )}
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
            P-{issueId.slice(0, 4).toUpperCase()}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleAttachmentChange(event)}
          />
          <SidePaneIconButton
            title={pinned ? "Unpin" : "Pin"}
            onClick={() => void handleTogglePin()}
            active={pinned}
            activeClass="text-warning"
          >
            <StarIcon size={11} filled={pinned} />
          </SidePaneIconButton>
          <SidePaneIconButton
            title="Attach files"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Spinner size={12} /> : <AttachIcon size={11} />}
          </SidePaneIconButton>
          <Link
            to="/$workspaceSlug/issues/$issueId"
            params={{ workspaceSlug, issueId }}
            title="Open full view"
            className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface/60 hover:text-fg"
            aria-label="Open full view"
          >
            <ExpandIcon />
          </Link>
          <SidePaneClose onClose={onClose} />
        </div>
      </SidePaneHeader>

      <SidePaneBody>
        {isLoading ? (
          <div className="space-y-3 p-5">
            <div className="h-6 w-3/4 skeleton-shimmer rounded-md" />
            <div className="h-3 w-1/3 skeleton-shimmer rounded-md" />
            <div className="mt-6 h-20 skeleton-shimmer rounded-md" />
          </div>
        ) : !issue ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <p className="text-sm text-fg">Issue not found.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-5 pb-8 pt-5">
            <EditableTitle value={issue.title} onSave={handleTitle} />

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-faint">
              {issue.createdBy ? (
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <Avatar name={issue.createdBy.name} image={issue.createdBy.image} />
                  {issue.createdBy.name}
                </span>
              ) : null}
              {issue.createdBy ? <span className="text-fg-faint/60">·</span> : null}
              <span>Created {formatDate(issue.createdAt)}</span>
              <span className="text-fg-faint/60">·</span>
              <span>Updated {formatDate(issue.updatedAt)}</span>
            </div>

            <div className="relative mt-6 pt-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <IssueProperties
                status={issue.status}
                statuses={statuses}
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
                project={issue.project ?? null}
                labels={issue.labels ?? []}
                onChangeStatus={handleStatus}
                onChangePriority={handlePriority}
                onChangeAssignee={handleAssignee}
                onChangeProject={handleProject}
                onChangeLabels={handleLabels}
              />
            </div>

            <div className="relative mt-6 pt-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <h3 className="mb-2 text-[11.5px] font-medium text-fg-muted">
                Description
              </h3>
              <EditableDescription value={issue.description} onSave={handleDescription} />
            </div>

            {recentComments.length > 0 || recentHistory.length > 0 ? (
              <div className="relative mt-6 pt-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
                />
                <h3 className="mb-2 text-[11.5px] font-medium text-fg-muted">
                  Recent activity
                </h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {recentComments.map((comment) => (
                    <li key={`comment-${comment.id}`} className="text-[12px] text-fg-muted">
                      <span className="text-fg">{comment.author?.name ?? "Someone"}</span>{" "}
                      commented · <span className="text-fg-faint">{formatDate(comment.createdAt)}</span>
                    </li>
                  ))}
                  {recentHistory.map((event) => (
                    <li key={`history-${event.id}`} className="text-[12px] text-fg-muted">
                      <span className="text-fg-faint">{describeBriefEvent(event)}</span>
                    </li>
                  ))}
                </ul>
                {comments.length + history.length > recentComments.length + recentHistory.length ? (
                  <Link
                    to="/$workspaceSlug/issues/$issueId"
                    params={{ workspaceSlug, issueId }}
                    className="mt-3 inline-block text-[11.5px] text-fg-muted transition-colors hover:text-fg"
                  >
                    View full timeline →
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div className="relative mt-6 pt-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <h3 className="mb-2 text-[11.5px] font-medium text-fg-muted">
                Comment
              </h3>
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Leave a comment…"
                rows={3}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void handleComment();
                  }
                }}
                className="w-full resize-y rounded-[8px] border border-border-subtle bg-surface/50 px-3 py-2 text-[13px] leading-relaxed text-fg outline-none transition-[border-color,background-color] duration-150 placeholder:text-fg-faint hover:border-border focus-visible:border-accent/60 focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-fg-faint">⌘ Enter to send</span>
                <button
                  type="button"
                  onClick={() => void handleComment()}
                  disabled={isCommenting || !commentBody.trim()}
                  className="inline-flex h-7 items-center rounded-[7px] bg-fg px-3 text-[11.5px] font-medium text-bg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] transition-colors hover:bg-fg/90 disabled:opacity-50"
                >
                  {isCommenting ? <Spinner size={11} /> : "Comment"}
                </button>
              </div>
            </div>

            {error ? (
              <p className="mt-4 text-[12px] text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6">
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/$workspaceSlug/issues/$issueId",
                    params: { workspaceSlug, issueId },
                  })
                }
                className="text-[11.5px] text-fg-muted transition-colors hover:text-fg"
              >
                Open full view →
              </button>
            </div>
          </div>
        )}
      </SidePaneBody>
    </>
  );
}

function SidePaneIconButton({
  title,
  onClick,
  disabled,
  active,
  activeClass,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md text-fg-muted transition-colors",
        "hover:bg-surface/60 hover:text-fg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active && activeClass,
      )}
    >
      {children}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M5 1.5H1.5v3.5M9 12.5h3.5V9M1.5 1.5l4 4M12.5 12.5l-4-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function describeBriefEvent(event: IssueHistoryEvent): string {
  const actor = event.actor?.name ?? "Someone";
  if (!event.changes || event.changes.length === 0) {
    return `${actor} updated this issue · ${formatDate(event.createdAt)}`;
  }
  const fields = event.changes.map((change) => change.field).join(", ");
  return `${actor} changed ${fields} · ${formatDate(event.createdAt)}`;
}
