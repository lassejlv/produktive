import { type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
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
import { priorityOptions, statusOptions } from "@/lib/issue-constants";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!shortcutEnabled) return;

    const onKey = (event: KeyboardEvent) => {
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
    if (open) setPosition({ x: 0, y: 0 });
  }, [open]);

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
    if (!manualFields.status) setStatus(parsedIssue.status ?? "backlog");
    if (!manualFields.priority) setPriority(parsedIssue.priority ?? "medium");
    if (!manualFields.assignee) setAssignedToId(parsedIssue.assignedToId);
    if (!manualFields.project) setProjectId(parsedIssue.projectId);
    if (!manualFields.labels) setLabelIds(parsedIssue.labelIds);
  }, [manualFields, parsedIssue]);

  const selectedMember = members.find((member) => member.id === assignedToId);
  const selectedProject = projects.find((project) => project.id === projectId);
  const submitTitle = parsedIssue.title || title.trim();

  const reset = () => {
    setTitle("");
    setDescription("");
    setStatus("backlog");
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
        className="max-w-2xl"
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader className="cursor-move select-none" onPointerDown={startDrag}>
            <DialogTitle>New issue</DialogTitle>
            <DialogClose onClose={close} />
          </DialogHeader>

          <DialogContent className="space-y-4 p-5">
            <Input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Issue title"
              className="h-10 border-0 bg-transparent px-0 text-base focus-visible:ring-0"
            />
            {title.trim() &&
            (parsedIssue.chips.length > 0 || parsedIssue.title !== title.trim()) ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border-subtle py-2 text-[11px] text-fg-muted">
                {parsedIssue.title && parsedIssue.title !== title.trim() ? (
                  <span className="min-w-0 truncate">
                    <span className="font-mono uppercase tracking-[0.12em] text-fg-faint">
                      title
                    </span>{" "}
                    <span className="text-fg">{parsedIssue.title}</span>
                  </span>
                ) : null}
                {parsedIssue.chips.map((chip) => (
                  <span
                    key={`${chip.kind}:${chip.label}`}
                    className="inline-flex items-baseline gap-1.5"
                  >
                    <span className="font-mono uppercase tracking-[0.12em] text-fg-faint">
                      {chip.kind}
                    </span>
                    <span className="text-fg-muted">{chip.label}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add description…"
              rows={4}
              className="w-full resize-y rounded-md border-0 bg-transparent px-0 py-0 text-sm text-fg outline-none placeholder:text-fg-faint focus-visible:ring-0"
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <PillSelect
                ariaLabel="Status"
                value={status}
                onChange={(value) => {
                  setManualFields((current) => ({ ...current, status: true }));
                  setStatus(value);
                }}
                options={statusOptions}
                icon={<StatusIcon status={status} />}
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
              />
              <MemberPicker
                selectedId={assignedToId}
                onSelect={(value) => {
                  setManualFields((current) => ({ ...current, assignee: true }));
                  setAssignedToId(value);
                }}
                trigger={({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
                  >
                    {selectedMember ? `@${selectedMember.name}` : "assignee"}
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
                  <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
                  >
                    {selectedProject ? `#${selectedProject.name}` : "project"}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <AttachIcon />
                Attach files
              </Button>
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
            </div>

            {attachments.length > 0 ? (
              <div className="grid gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle">
                {attachments.map(({ id, file }) => (
                  <div
                    key={id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-bg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-fg">{file.name}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-fg-faint">
                        {file.type || "application/octet-stream"}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-fg-muted">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(id)}
                      className="grid size-6 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
                      aria-label={`Remove ${file.name}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 3l8 8M11 3l-8 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </DialogContent>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving || !submitTitle}>
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                  {attachments.length > 0 ? "Creating and uploading…" : "Creating…"}
                </span>
              ) : (
                "Create issue"
              )}
            </Button>
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
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
        >
          <LabelTagIcon />
          {selectedIds.length > 0 ? `${selectedIds.length} labels` : "labels"}
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
