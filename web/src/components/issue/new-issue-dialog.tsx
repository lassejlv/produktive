import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AttachIcon } from "@/components/chat/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PillSelect } from "@/components/issue/pill-select";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { LabelPicker } from "@/components/label/label-picker";
import { MemberPicker } from "@/components/issue/member-picker";
import { ProjectPicker } from "@/components/project/project-picker";
import {
  type Issue,
  type Label,
  type Member,
  type Project,
  createIssue,
  listLabels,
  listMembers,
  listProjects,
  uploadIssueAttachment,
} from "@/lib/api";
import {
  type ChatAttachmentDraft,
  formatBytes,
  prepareChatAttachments,
} from "@/lib/chat-attachments";
import { parseNaturalIssueInput } from "@/lib/issue-natural-input";
import { firstStatusForCategory, priorityOptions, sortedStatuses } from "@/lib/issue-constants";
import { findSimilarIssues } from "@/lib/issue-similarity";
import { useIssues } from "@/lib/use-issues";
import { useIssueStatuses } from "@/lib/use-issue-statuses";

const META_CHIP =
  "inline-flex h-7 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2 px-2 text-[11px] font-medium text-fg-muted transition-colors duration-150 hover:border-border hover:bg-surface hover:text-fg";

const ROUTING_SELECT =
  "h-7 rounded-md border-border-subtle bg-surface-2 px-2 text-[11px] font-medium transition-colors duration-150 hover:border-border [&>svg]:mx-0 [&>svg]:text-fg-faint";

export function NewIssueDialog({
  triggerLabel = "New issue",
  triggerVariant = "default",
  triggerSize = "sm",
  triggerClassName,
  shortcutEnabled = false,
  onCreated,
}: {
  triggerLabel?: React.ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "danger" | "link";
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerClassName?: string;
  shortcutEnabled?: boolean;
  onCreated?: (issue: Issue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("backlog");
  const [priority, setPriority] = useState<string>("medium");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const { statuses } = useIssueStatuses();
  const defaultStatus = firstStatusForCategory(statuses, "backlog", "backlog");
  const [manualFields, setManualFields] = useState({
    status: false,
    priority: false,
    assignee: false,
    project: false,
    labels: false,
  });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const { issues: existingIssues } = useIssues();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [footerShortcutHint, setFooterShortcutHint] = useState("");

  useEffect(() => {
    if (!shortcutEnabled) return;

    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcutEnabled]);

  useEffect(() => {
    if (!shortcutEnabled) return;
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("produktive:new-issue", onOpenEvent as EventListener);
    return () => window.removeEventListener("produktive:new-issue", onOpenEvent as EventListener);
  }, [shortcutEnabled]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: globalThis.PointerEvent) => {
      setPosition({
        x: dragging.originX + event.clientX - dragging.startX,
        y: dragging.originY + event.clientY - dragging.startY,
      });
    };
    const onUp = () => setDragging(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (open) {
      setPosition({ x: 0, y: 0 });
      setDismissedSuggestions(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFooterShortcutHint("");
      return;
    }

    const isApple =
      typeof navigator !== "undefined" &&
      (/^(Mac|iPhone|iPad|iPod)/u.test(navigator.platform) || /\bMac OS X\b/u.test(navigator.userAgent));
    setFooterShortcutHint(isApple ? "\u2318 Enter submit · Esc close" : "Ctrl+Enter submit · Esc close");
  }, [open]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedTitle(title), 250);
    return () => window.clearTimeout(handle);
  }, [title]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void Promise.all([listMembers(), listProjects(false), listLabels(false)])
      .then(([membersResponse, projectsResponse, labelsResponse]) => {
        if (cancelled) return;
        setMembers(membersResponse.members);
        setProjects(projectsResponse.projects);
        setLabels(labelsResponse.labels);
      })
      .catch(() => {
        // Natural parsing is best-effort. The core issue form still works.
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const parsedIssue = useMemo(
    () => parseNaturalIssueInput(title, { members, projects, labels }),
    [title, members, projects, labels],
  );

  useEffect(() => {
    if (!manualFields.status) setStatus(parsedIssue.status ?? defaultStatus);
    if (!manualFields.priority) setPriority(parsedIssue.priority ?? "medium");
    if (!manualFields.assignee) setAssignedToId(parsedIssue.assignedToId);
    if (!manualFields.project) setProjectId(parsedIssue.projectId);
    if (!manualFields.labels) setLabelIds(parsedIssue.labelIds);
  }, [defaultStatus, manualFields, parsedIssue]);

  const selectedMember = members.find((member) => member.id === assignedToId);
  const selectedProject = projects.find((project) => project.id === projectId);
  const submitTitle = parsedIssue.title || title.trim();

  const debouncedParsed = useMemo(
    () => parseNaturalIssueInput(debouncedTitle, { members, projects, labels }),
    [debouncedTitle, members, projects, labels],
  );
  const similarityQuery = (debouncedParsed.title || debouncedTitle).trim();
  const similarSuggestions = useMemo(() => {
    if (similarityQuery.length < 6) return [];
    return findSimilarIssues(similarityQuery, existingIssues, { limit: 3 });
  }, [similarityQuery, existingIssues]);
  const visibleSuggestions = similarSuggestions.filter(
    (s) => !dismissedSuggestions.has(s.issue.id),
  );

  const dismissSuggestion = (id: string) => {
    setDismissedSuggestions((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setStatus(defaultStatus);
    setPriority("medium");
    setAssignedToId(null);
    setProjectId(null);
    setLabelIds([]);
    setAttachments([]);
    setManualFields({
      status: false,
      priority: false,
      assignee: false,
      project: false,
      labels: false,
    });
  };

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitTitle) {
      setError("Issue title is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let response = await createIssue({
        title: submitTitle,
        description: description || undefined,
        status,
        priority,
        assignedToId: assignedToId || undefined,
        projectId: projectId || undefined,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      });

      for (const attachment of attachments) {
        response = await uploadIssueAttachment(response.issue.id, attachment.file);
      }

      onCreated?.(response.issue);
      reset();
      setOpen(false);
      toast.success("Issue created");
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Failed to create issue";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAttachmentChange = (files: FileList | null) => {
    if (!files?.length) return;

    const result = prepareChatAttachments(files, attachments.length);
    if (result.attachments.length > 0) {
      setAttachments((current) => [...current, ...result.attachments]);
    }

    const nextError = result.errors[0] ?? null;
    setError(nextError);
    if (nextError) toast.error(nextError);
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((file) => file.id !== id));
    setError(null);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    event.preventDefault();
    setDragging({
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    });
  };

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        data-tour="new-issue-trigger"
      >
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={close}
        className="max-w-[min(560px,calc(100vw-28px))] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      >
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={(event: ReactKeyboardEvent<HTMLFormElement>) => {
            if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
            event.preventDefault();
            if (isSaving || !submitTitle) return;
            formRef.current?.requestSubmit();
          }}
          className="flex max-h-[min(85vh,720px)] flex-col"
        >
          <DialogHeader
            className="cursor-move select-none border-b border-border-subtle px-4 py-2.5 sm:px-5"
            onPointerDown={startDrag}
          >
            <DialogTitle className="text-[13px] font-medium text-fg-muted">New issue</DialogTitle>
            <DialogClose onClose={close} />
          </DialogHeader>

          <DialogContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-4 pt-4 pb-1 sm:px-5">
                <input
                  id="new-issue-title"
                  autoFocus
                  required
                  aria-label="Issue title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Issue title"
                  className="w-full bg-transparent py-0 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-fg outline-none placeholder:text-fg-faint focus-visible:ring-1 focus-visible:ring-ring/45"
                />
              </div>

              {parsedIssue.title && parsedIssue.title !== title.trim() ? (
                <p className="mt-1 truncate px-4 text-[11px] text-fg-faint sm:px-5">
                  Saves as <span className="text-fg-muted">{parsedIssue.title}</span>
                </p>
              ) : null}

               <div className="mt-3 border-border-subtle border-t px-4 pb-3 pt-3 sm:mt-4 sm:px-5">
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add description…"
                  rows={4}
                   className="max-h-[40vh] min-h-[112px] w-full resize-y border-0 bg-transparent text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-faint focus-visible:ring-1 focus-visible:ring-ring/35"
                />
              </div>

               {visibleSuggestions.length > 0 ? (
                 <div className="border-border-subtle border-t px-4 py-3 sm:px-5">
                  <p className="mb-2 text-[11px] font-medium text-fg-muted">Similar issues</p>
                  <ul className="m-0 flex list-none flex-col gap-0 p-0">
                    {visibleSuggestions.map(({ issue }) => (
                      <li
                        key={issue.id}
                        className="group flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-surface-2"
                      >
                        <StatusIcon status={issue.status} statuses={statuses} />
                        <p className="m-0 min-w-0 flex-1 truncate text-[13px] leading-tight text-fg">{issue.title}</p>
                        <a
                          href={`/issues/${issue.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-[11px] text-accent opacity-0 transition-opacity group-hover:opacity-100 hover:underline focus-visible:opacity-100"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => dismissSuggestion(issue.id)}
                          aria-label={`Dismiss ${issue.title}`}
                          className="grid size-7 shrink-0 place-items-center rounded-md text-[15px] leading-none text-fg-muted opacity-0 hover:bg-bg focus-visible:bg-bg group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

               <div className="border-border-subtle border-t px-4 pb-5 pt-3 sm:px-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    handleAttachmentChange(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
                  <PillSelect
                    ariaLabel="Status"
                    value={status}
                    onChange={(value) => {
                      setManualFields((current) => ({ ...current, status: true }));
                      setStatus(value);
                    }}
                    options={sortedStatuses(statuses).map((status) => status.key)}
                    icon={<StatusIcon status={status} statuses={statuses} />}
                    className={`${ROUTING_SELECT} w-auto`}
                  />
                  <PillSelect
                    ariaLabel="Priority"
                    value={priority}
                    onChange={(value) => {
                      setManualFields((current) => ({ ...current, priority: true }));
                      setPriority(value);
                    }}
                    options={priorityOptions}
                    icon={<PriorityIcon priority={priority} />}
                    className={`${ROUTING_SELECT} w-auto`}
                  />
                  <MemberPicker
                    selectedId={assignedToId}
                    onSelect={(value) => {
                      setManualFields((current) => ({ ...current, assignee: true }));
                      setAssignedToId(value);
                    }}
                    trigger={({ onClick }) => (
                      <button type="button" onClick={onClick} className={`${META_CHIP}`}>
                        <span className="min-w-0 truncate">{selectedMember ? `@${selectedMember.name}` : "Assignee"}</span>
                      </button>
                    )}
                  />
                  <ProjectPicker
                    selectedId={projectId}
                    onSelect={(value) => {
                      setManualFields((current) => ({ ...current, project: true }));
                      setProjectId(value);
                    }}
                    trigger={({ onClick }) => (
                      <button type="button" onClick={onClick} className={`${META_CHIP}`}>
                        <span className="min-w-0 truncate">{selectedProject ? `#${selectedProject.name}` : "Project"}</span>
                      </button>
                    )}
                  />
                  <NewIssueLabels
                    selectedIds={labelIds}
                    onChange={(value) => {
                      setManualFields((current) => ({ ...current, labels: true }));
                      setLabelIds(value);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`${META_CHIP} border-dashed text-fg-faint`}
                    title="Attach files"
                  >
                    <AttachIcon />
                    Attach
                  </button>
                </div>

                {attachments.length > 0 ? (
                  <ul className="m-0 mt-2 flex list-none flex-col gap-0 p-0">
                    {attachments.map(({ id, file }) => (
                      <li key={id} className="flex items-center gap-3 py-1">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">{file.name}</span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(id)}
                          className="grid size-5 shrink-0 place-items-center rounded text-fg-faint transition-colors hover:bg-surface hover:text-fg"
                          aria-label={`Remove ${file.name}`}
                        >
                          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {error ? (
                  <p className="mt-3 text-[12px] leading-relaxed text-danger" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          </DialogContent>

          <DialogFooter className="flex items-center gap-3 border-border-subtle bg-surface/50 px-4 py-2.5 sm:px-5">
            <span className="hidden min-w-0 flex-1 truncate text-[11px] text-fg-faint select-none lg:inline">
              {footerShortcutHint}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-md px-2 text-[12px] text-fg-muted hover:text-fg"
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 rounded-md px-4 text-[12px] font-medium"
                disabled={isSaving || !submitTitle}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                    {attachments.length > 0 ? "Creating & uploading…" : "Creating…"}
                  </span>
                ) : (
                  "Create issue"
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}

function NewIssueLabels({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <LabelPicker
      selectedIds={selectedIds}
      onChange={onChange}
      trigger={({ onClick }) => (
        <button
          type="button"
          onClick={onClick}
          className={`${META_CHIP} w-max max-w-full min-w-0`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <LabelTagIcon />
            <span className="truncate">
              {selectedIds.length > 0 ? `${selectedIds.length} labels` : "Labels"}
            </span>
          </span>
        </button>
      )}
    />
  );
}

function LabelTagIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
