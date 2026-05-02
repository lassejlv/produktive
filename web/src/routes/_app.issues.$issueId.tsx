import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Avatar } from "@/components/issue/avatar";
import { EditableDescription } from "@/components/issue/editable-description";
import { EditableTitle } from "@/components/issue/editable-title";
import { IssueProperties } from "@/components/issue/issue-properties";
import {
  apiPath,
  type Issue,
  type IssueAttachment,
  type IssueComment,
  type IssueHistoryChange,
  type IssueHistoryEvent,
  type IssueSubscriberUser,
  createIssue,
  createIssueComment,
  listIssueSubscribers,
  listMembers,
  subscribeToIssue,
  unsubscribeFromIssue,
  uploadIssueAttachment,
} from "@/lib/api";
import { formatBytes, prepareChatAttachments } from "@/lib/chat-attachments";
import { formatDate } from "@/lib/issue-constants";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useFavorites } from "@/lib/use-favorites";
import {
  issueCommentsQueryOptions,
  issueDetailQueryOptions,
  issueHistoryQueryOptions,
  useIssueCommentsQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
  useIssueSubscribersQuery,
  useIssuesQuery,
} from "@/lib/queries/issues";
import { queryKeys } from "@/lib/queries/keys";
import {
  useCreateIssue,
  useDeleteIssue,
  useUpdateIssue,
} from "@/lib/mutations/issues";
import { useLabelsQuery } from "@/lib/queries/labels";
import { useProjectsQuery } from "@/lib/queries/projects";
import { useRegisterTab } from "@/lib/use-tabs";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { useUserPreferences } from "@/lib/use-user-preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/issues/$issueId")({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      issueHistoryQueryOptions(params.issueId),
    );
    void context.queryClient.prefetchQuery(
      issueCommentsQueryOptions(params.issueId),
    );
    return context.queryClient.ensureQueryData(
      issueDetailQueryOptions(params.issueId),
    );
  },
  component: IssueDetailPage,
});

function IssueDetailPage() {
  const { issueId } = Route.useParams();
  return <IssueDetail issueId={issueId} />;
}

export type IssueDetailSiblings = {
  position: number | null;
  total: number;
  prevId: string | null;
  nextId: string | null;
};

export function IssueDetail({
  issueId,
  siblings,
}: {
  issueId: string;
  siblings?: IssueDetailSiblings;
}) {
  const navigate = useNavigate();
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
  const isLoading = issueQuery.isPending;
  const { tabsEnabled } = useUserPreferences();
  useRegisterTab({
    tabType: "issue",
    targetId: issueId,
    title: issue?.title,
    enabled: tabsEnabled,
  });

  const lookups = useMemo<Lookups>(
    () => ({
      projects: new Map(
        (projectsQuery.data ?? []).map((p) => [p.id, p.name]),
      ),
      members: new Map(
        (membersQuery.data ?? []).map((m) => [m.id, m.name]),
      ),
      labels: new Map(
        (labelsQuery.data ?? []).map((l) => [l.id, l.name]),
      ),
    }),
    [projectsQuery.data, membersQuery.data, labelsQuery.data],
  );

  const updateIssueMutation = useUpdateIssue();
  const deleteIssueMutation = useDeleteIssue();

  const [commentBody, setCommentBody] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const onboarding = useOnboarding();
  const pinned = isFavorite("issue", issueId);

  useEffect(() => {
    setError(issueQuery.error?.message ?? null);
  }, [issueQuery.error]);

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

  useEffect(() => {
    if (!siblings) return;
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
      if (
        (event.key === "j" || event.key === "ArrowDown") &&
        siblings.nextId
      ) {
        event.preventDefault();
        void navigate({
          to: "/issues/$issueId",
          params: { issueId: siblings.nextId },
        });
      } else if (
        (event.key === "k" || event.key === "ArrowUp") &&
        siblings.prevId
      ) {
        event.preventDefault();
        void navigate({
          to: "/issues/$issueId",
          params: { issueId: siblings.prevId },
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [siblings, navigate]);

  const reloadAfterChange = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
      qc.invalidateQueries({ queryKey: queryKeys.issues.history(issueId) }),
      qc.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) }),
    ]);
  };

  useEffect(() => {
    const source = new EventSource(
      apiPath(
        `/api/realtime?channel=issueSystem&id=${encodeURIComponent(issueId)}`,
      ),
      { withCredentials: true },
    );

    source.addEventListener("refresh", () => {
      void reloadAfterChange();
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

  const handleTogglePin = async () => {
    try {
      await toggleFavorite("issue", issueId);
      toast.success(pinned ? "Removed from favorites" : "Pinned to sidebar");
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const updateField = async (
    patch: Parameters<typeof updateIssueMutation.mutateAsync>[0]["patch"],
    errorLabel: string,
    onSuccess?: () => void,
  ) => {
    if (!issue) return;
    try {
      await updateIssueMutation.mutateAsync({ id: issue.id, patch });
      onSuccess?.();
      await reloadAfterChange();
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : errorLabel;
      setError(message);
      toast.error(message);
    }
  };

  const handleStatus = (next: string) =>
    void updateField({ status: next }, "Failed to update issue");

  const handlePriority = (next: string) =>
    void updateField({ priority: next }, "Failed to update issue", () =>
      onboarding.signal("priority-or-assignee-changed"),
    );

  const handleTitle = (next: string) =>
    void updateField({ title: next }, "Failed to update title");

  const handleDescription = (next: string) =>
    void updateField({ description: next }, "Failed to update description");

  const handleAssignee = (memberId: string | null) =>
    void updateField(
      { assignedToId: memberId },
      "Failed to update assignee",
      () => onboarding.signal("priority-or-assignee-changed"),
    );

  const handleLabels = (labelIds: string[]) =>
    void updateField({ labelIds }, "Failed to update labels");

  const handleProject = (projectId: string | null) =>
    void updateField(
      { projectId: projectId ?? "" },
      "Failed to update project",
      () =>
        toast.success(projectId ? "Project updated" : "Project cleared"),
    );

  const handleDelete = () => {
    if (!issue) return;
    confirm({
      title: "Delete this issue?",
      description: "This can't be undone.",
      confirmLabel: "Delete issue",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteIssueMutation.mutateAsync(issue.id);
          void navigate({ to: "/issues" });
        } catch (deleteError) {
          const message =
            deleteError instanceof Error
              ? deleteError.message
              : "Failed to delete issue";
          setError(message);
          toast.error(message);
        }
      },
    });
  };

  const handleComment = async () => {
    if (!issue) return;
    const body = commentBody.trim();
    if (!body) return;

    setIsCommenting(true);
    setError(null);
    try {
      const response = await createIssueComment(issue.id, body);
      qc.setQueryData<IssueComment[]>(
        queryKeys.issues.comments(issue.id),
        (old) => (old ? [...old, response.comment] : [response.comment]),
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
      qc.setQueryData(queryKeys.issues.detail(issue.id), nextIssue);
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
    <main className="min-h-full bg-bg" data-tour="issue-detail">
      {confirmDialog}
      <header className="flex items-center justify-between gap-3 px-6 pt-5">
        <div className="flex items-center gap-3">
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
          {siblings && siblings.position !== null ? (
            <SiblingsNav
              siblings={siblings}
              onNavigate={(id) =>
                void navigate({
                  to: "/issues/$issueId",
                  params: { issueId: id },
                })
              }
            />
          ) : null}
        </div>
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
                      handleDelete();
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
        <article className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-10 animate-fade-in">
          <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="order-2 min-w-0 md:order-none">
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
                {issue.createdBy ? (
                  <span className="text-fg-faint/60">·</span>
                ) : null}
                <span>Created {formatDate(issue.createdAt)}</span>
                <span className="text-fg-faint/60">·</span>
                <span>Updated {formatDate(issue.updatedAt)}</span>
              </div>

              <div className="mt-10">
                <EditableDescription
                  value={issue.description}
                  onSave={handleDescription}
                />
              </div>

              <SubIssuesSection parentId={issueId} />

              {issue.attachments && issue.attachments.length > 0 ? (
                <section className="mt-12">
                  <h2 className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                    Attachments
                  </h2>
                  <AttachmentRail attachments={issue.attachments} />
                </section>
              ) : null}

              <section className="mt-14 border-t border-border-subtle pt-8">
                <IssueTimeline items={timeline} lookups={lookups} />
                <div className="mt-6">
                  <CommentComposer
                    value={commentBody}
                    disabled={isCommenting}
                    onChange={setCommentBody}
                    onSubmit={() => void handleComment()}
                  />
                </div>
              </section>
            </div>

            <aside className="order-1 md:order-none md:sticky md:top-10 md:self-start">
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
                onChangeStatus={(next) => void handleStatus(next)}
                onChangePriority={(next) => void handlePriority(next)}
                onChangeAssignee={(id) => void handleAssignee(id)}
                onChangeProject={(id) => void handleProject(id)}
                onChangeLabels={(ids) => void handleLabels(ids)}
              />
              <div className="my-4 h-px bg-border-subtle" />
              <SubscribeStrip issueId={issueId} />
            </aside>
          </div>
        </article>
      )}
    </main>
  );
}

function SubIssuesSection({ parentId }: { parentId: string }) {
  const navigate = useNavigate();
  const issuesQuery = useIssuesQuery();
  const children = useMemo(
    () =>
      (issuesQuery.data ?? []).filter((issue) => issue.parentId === parentId),
    [issuesQuery.data, parentId],
  );
  const loading = issuesQuery.isPending;
  const createIssueMutation = useCreateIssue();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await createIssueMutation.mutateAsync({ title: trimmed, parentId });
      setDraft("");
      setCreating(false);
      toast.success("Sub-issue added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && children.length === 0 && !creating) return null;

  const done = children.filter((c) => c.status === "done").length;

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
            Sub-issues
          </h2>
          {children.length > 0 ? (
            <span className="text-[11px] tabular-nums text-fg-faint">
              {done} / {children.length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-[11px] text-fg-muted transition-colors hover:text-fg"
        >
          + Add
        </button>
      </div>
      {children.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border-subtle">
          {children.map((child, index) => (
            <li
              key={child.id}
              className={cn(
                "border-border-subtle",
                index !== children.length - 1 && "border-b",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/issues/$issueId",
                    params: { issueId: child.id },
                  })
                }
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface/40"
              >
                <SubIssueStatusDot status={child.status} />
                <span className="font-mono text-[11px] text-fg-faint">
                  P-{child.id.slice(0, 4).toUpperCase()}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    child.status === "done"
                      ? "text-fg-muted line-through"
                      : "text-fg",
                  )}
                >
                  {child.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className={cn(
            "mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2",
          )}
        >
          <span className="size-3 rounded-full border border-dashed border-fg-faint" />
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setCreating(false);
                setDraft("");
              }
            }}
            onBlur={() => {
              if (!draft.trim()) {
                setCreating(false);
                setDraft("");
              }
            }}
            placeholder="Sub-issue title…"
            disabled={submitting}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || submitting}
            className="rounded-md bg-fg px-2 py-0.5 text-[11px] font-medium text-bg disabled:opacity-50"
          >
            {submitting ? "…" : "Add"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function SubIssueStatusDot({ status }: { status: string }) {
  const color =
    status === "done"
      ? "bg-success"
      : status === "in-progress"
        ? "bg-accent"
        : status === "todo"
          ? "bg-fg-muted"
          : "border border-dashed border-fg-faint";
  return <span className={cn("size-3 shrink-0 rounded-full", color)} />;
}

function SubscribeStrip({ issueId }: { issueId: string }) {
  const qc = useQueryClient();
  const subscribersQuery = useIssueSubscribersQuery(issueId);
  const subscribers = subscribersQuery.data?.subscribers ?? [];
  const subscribed = subscribersQuery.data?.subscribed ?? false;
  const loading = subscribersQuery.isPending;
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = subscribed
        ? await unsubscribeFromIssue(issueId)
        : await subscribeToIssue(issueId);
      qc.setQueryData(queryKeys.issues.subscribers(issueId), response);
      toast.success(subscribed ? "Unsubscribed" : "Subscribed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  const visible = subscribers.slice(0, 4);
  const extra = subscribers.length - visible.length;

  return (
    <div className="flex items-center gap-2 text-[11px] text-fg-muted">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className="rounded-full border border-border-subtle px-2 py-0.5 transition-colors hover:border-border hover:text-fg disabled:opacity-50"
      >
        {subscribed ? "Unsubscribe" : "Subscribe"}
      </button>
      {visible.length > 0 ? (
        <div className="flex -space-x-1.5">
          {visible.map((user) => (
            <span
              key={user.id}
              title={user.name}
              className="grid size-5 place-items-center rounded-full border border-bg bg-surface-2 text-[9px] font-medium text-fg-muted"
            >
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="size-5 rounded-full object-cover"
                />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </span>
          ))}
          {extra > 0 ? (
            <span className="grid size-5 place-items-center rounded-full border border-bg bg-surface-2 text-[9px] tabular-nums text-fg-muted">
              +{extra}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SiblingsNav({
  siblings,
  onNavigate,
}: {
  siblings: IssueDetailSiblings;
  onNavigate: (id: string) => void;
}) {
  const goPrev = () => {
    if (siblings.prevId) onNavigate(siblings.prevId);
  };
  const goNext = () => {
    if (siblings.nextId) onNavigate(siblings.nextId);
  };

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface/40 px-2 py-0.5 text-[11px] text-fg-muted">
      <span className="tabular-nums">
        {siblings.position} <span className="text-fg-faint">/</span>{" "}
        {siblings.total}
      </span>
      <div className="flex items-center">
        <button
          type="button"
          onClick={goPrev}
          disabled={!siblings.prevId}
          aria-label="Previous issue"
          className="grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-faint"
        >
          <ArrowIcon direction="up" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!siblings.nextId}
          aria-label="Next issue"
          className="grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-faint"
        >
          <ArrowIcon direction="down" />
        </button>
      </div>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        transform: direction === "up" ? "rotate(180deg)" : "none",
      }}
    >
      <path
        d="M3 4.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

type Lookups = {
  projects: Map<string, string>;
  members: Map<string, string>;
  labels: Map<string, string>;
};

type TimelineItem =
  | {
      type: "created";
      key: string;
      date: string;
      actor: IssueHistoryEvent["actor"];
    }
  | {
      type: "attachment";
      key: string;
      date: string;
      actor: IssueHistoryEvent["actor"];
      change: IssueHistoryChange;
    }
  | {
      type: "change";
      key: string;
      date: string;
      actor: IssueHistoryEvent["actor"];
      change: IssueHistoryChange;
    }
  | { type: "comment"; key: string; date: string; comment: IssueComment };

function buildTimeline(
  events: IssueHistoryEvent[],
  comments: IssueComment[],
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const event of events) {
    if (event.action === "created") {
      items.push({
        type: "created",
        key: `created-${event.id}`,
        date: event.createdAt,
        actor: event.actor,
      });
      continue;
    }
    if (event.action === "attachment_added") {
      const change = event.changes[0];
      if (change) {
        items.push({
          type: "attachment",
          key: `att-${event.id}`,
          date: event.createdAt,
          actor: event.actor,
          change,
        });
      }
      continue;
    }
    const meaningful = event.changes.filter(isMeaningfulChange);
    meaningful.forEach((change, index) => {
      items.push({
        type: "change",
        key: `change-${event.id}-${change.field}-${index}`,
        date: event.createdAt,
        actor: event.actor,
        change,
      });
    });
  }
  for (const comment of comments) {
    items.push({
      type: "comment",
      key: `comment-${comment.id}`,
      date: comment.createdAt,
      comment,
    });
  }
  return items.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function IssueTimeline({
  items,
  lookups,
}: {
  items: TimelineItem[];
  lookups: Lookups;
}) {
  if (items.length === 0) {
    return <p className="text-[13px] text-fg-faint">No activity yet.</p>;
  }

  return (
    <ol className="relative flex flex-col">
      <span
        aria-hidden
        className="absolute left-[11px] top-2 bottom-2 w-px bg-border-subtle"
      />
      {items.map((item) => (
        <li key={item.key} className="relative">
          {item.type === "comment" ? (
            <CommentRow comment={item.comment} />
          ) : (
            <EventRow item={item} lookups={lookups} />
          )}
        </li>
      ))}
    </ol>
  );
}

function CommentRow({ comment }: { comment: IssueComment }) {
  return (
    <article className="relative flex gap-3 py-3">
      <span className="relative z-10 mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-bg">
        <Avatar name={comment.author?.name} image={comment.author?.image} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[12.5px]">
          <span className="font-medium text-fg">
            {comment.author?.name ?? "Unknown user"}
          </span>
          <span className="text-[11.5px] text-fg-faint">
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <div className="mt-1 text-[14px] leading-[1.6] text-fg">
          <ChatMarkdown content={comment.body} />
        </div>
      </div>
    </article>
  );
}

function EventRow({
  item,
  lookups,
}: {
  item: Exclude<TimelineItem, { type: "comment" }>;
  lookups: Lookups;
}) {
  const summary = describeEvent(item, lookups);
  return (
    <div className="relative flex items-center gap-3 py-1.5">
      <span className="relative z-10 grid size-[22px] shrink-0 place-items-center bg-bg">
        <span className="size-[7px] rounded-full border border-border bg-surface" />
      </span>
      <div className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
        <span className="text-fg">
          {item.actor?.name ?? "Someone"}
        </span>{" "}
        {summary}
        <span className="ml-2 text-[11.5px] text-fg-faint">
          {formatDate(item.date)}
        </span>
      </div>
    </div>
  );
}

function describeEvent(
  item: Exclude<TimelineItem, { type: "comment" }>,
  lookups: Lookups,
): React.ReactNode {
  if (item.type === "created") return <>created the issue</>;
  if (item.type === "attachment") {
    return (
      <>
        attached <Token>{attachmentName(item.change.after)}</Token>
      </>
    );
  }
  return describeChange(item.change, lookups);
}

function describeChange(
  change: IssueHistoryChange,
  lookups: Lookups,
): React.ReactNode {
  switch (change.field) {
    case "title":
      return <>renamed the issue</>;
    case "description":
      return <>edited the description</>;
    case "status": {
      const after = formatToken(change.after);
      return (
        <>
          set status to <Token>{after}</Token>
        </>
      );
    }
    case "priority": {
      const after = formatToken(change.after);
      return (
        <>
          set priority to <Token>{after}</Token>
        </>
      );
    }
    case "assignedToId": {
      const name = resolveId(change.after, lookups.members);
      if (!name) return <>removed the assignee</>;
      return (
        <>
          assigned <Token>{name}</Token>
        </>
      );
    }
    case "projectId": {
      const name = resolveId(change.after, lookups.projects);
      if (!name) return <>removed the project</>;
      return (
        <>
          moved to <Token>{name}</Token>
        </>
      );
    }
    case "labelIds": {
      const before = toIdArray(change.before);
      const after = toIdArray(change.after);
      const added = after.filter((id) => !before.includes(id));
      const removed = before.filter((id) => !after.includes(id));
      const names = (ids: string[]) =>
        ids.map((id) => lookups.labels.get(id) ?? "label").join(", ");
      if (added.length && !removed.length)
        return (
          <>
            added <Token>{names(added)}</Token>
          </>
        );
      if (removed.length && !added.length)
        return (
          <>
            removed <Token>{names(removed)}</Token>
          </>
        );
      return <>updated labels</>;
    }
    case "parentId":
      return isEmpty(change.after) ? (
        <>removed the parent issue</>
      ) : (
        <>set the parent issue</>
      );
    default:
      return <>updated {fieldLabel(change.field).toLowerCase()}</>;
  }
}

function Token({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
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
  const [focused, setFocused] = useState(false);
  const empty = value.trim().length === 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[10px] border bg-surface/30 px-3.5 py-3 transition-colors",
        focused
          ? "border-border bg-surface/60"
          : "border-border-subtle hover:border-border",
      )}
    >
      <label className="sr-only" htmlFor="issue-comment">
        Comment
      </label>
      <textarea
        id="issue-comment"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Add a comment…"
        rows={2}
        className="min-h-[40px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.6] text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
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
              : "bg-fg text-bg hover:bg-fg/90",
          )}
        >
          {disabled ? "Sending…" : "Reply"}
        </button>
      </div>
    </div>
  );
}

function isMeaningfulChange(change: IssueHistoryChange): boolean {
  if (isEmpty(change.before) && isEmpty(change.after)) return false;
  if (valuesEqual(change.before, change.after)) return false;
  if (change.field === "labelIds") {
    const before = toIdArray(change.before);
    const after = toIdArray(change.after);
    if (
      before.length === after.length &&
      before.every((id) => after.includes(id))
    ) {
      return false;
    }
  }
  return true;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => item === b[index]);
  }
  return a === b;
}

function toIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry));
}

function resolveId(
  value: unknown,
  map: Map<string, string>,
): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return map.get(value) ?? null;
}

function formatToken(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return displayValue(value);
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

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    assignedToId: "Assignee",
    projectId: "Project",
    labelIds: "Labels",
    parentId: "Parent",
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

function attachmentName(value: unknown) {
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "file";
}
