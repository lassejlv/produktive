import {
  type FormEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { type Issue, createIssue, uploadIssueAttachment } from "@/lib/api";
import {
  type ChatAttachmentDraft,
  formatBytes,
  prepareChatAttachments,
} from "@/lib/chat-attachments";
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
  triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "danger" | "link";
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
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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

  const reset = () => {
    setTitle("");
    setDescription("");
    setStatus("backlog");
    setPriority("medium");
    setAttachments([]);
  };

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      let response = await createIssue({
        title,
        description: description || undefined,
        status,
        priority,
      });

      for (const attachment of attachments) {
        response = await uploadIssueAttachment(response.issue.id, attachment.file);
      }

      onCreated?.(response.issue);
      reset();
      setOpen(false);
      toast.success("Issue created");
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Failed to create issue";
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
          <DialogHeader
            className="cursor-move select-none"
            onPointerDown={startDrag}
          >
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
                onChange={setStatus}
                options={statusOptions}
                icon={<StatusIcon status={status} />}
              />
              <PillSelect
                ariaLabel="Priority"
                value={priority}
                onChange={setPriority}
                options={priorityOptions}
                icon={<PriorityIcon priority={priority} />}
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
                      <p className="truncate font-mono text-[11px] text-fg">
                        {file.name}
                      </p>
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
            <Button type="submit" size="sm" disabled={isSaving || !title.trim()}>
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
