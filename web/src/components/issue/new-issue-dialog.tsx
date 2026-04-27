import { useEffect, useState } from "react";
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
import { type Issue, createIssue } from "@/lib/api";
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const reset = () => {
    setTitle("");
    setDescription("");
    setStatus("backlog");
    setPriority("medium");
  };

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await createIssue({
        title,
        description: description || undefined,
        status,
        priority,
      });

      onCreated?.(response.issue);
      reset();
      setOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create issue",
      );
    } finally {
      setIsSaving(false);
    }
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

      <Dialog open={open} onClose={close}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New issue</DialogTitle>
            <DialogClose onClose={close} />
          </DialogHeader>

          <DialogContent className="space-y-3 p-4">
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
            </div>

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
                  Creating…
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
