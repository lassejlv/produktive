import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { type Label, createLabel } from "@/lib/api";
import {
  defaultLabelColor,
  labelColorHex,
  labelColorOptions,
} from "@/lib/label-constants";
import { cn } from "@/lib/utils";

type NewLabelDialogProps = {
  onCreated?: (label: Label) => void;
  /** When true, the trigger button is not rendered — opens via custom event only. */
  headless?: boolean;
};

export function NewLabelDialog({ onCreated, headless }: NewLabelDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(defaultLabelColor);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!headless) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setName(detail.name);
      setOpen(true);
    };
    window.addEventListener("produktive:new-label", handler as EventListener);
    return () =>
      window.removeEventListener(
        "produktive:new-label",
        handler as EventListener,
      );
  }, [headless]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [open]);

  const reset = () => {
    setName("");
    setColor(defaultLabelColor);
    setDescription("");
    setSubmitting(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const response = await createLabel({
        name: trimmed,
        color,
        description: description.trim() || undefined,
      });
      onCreated?.(response.label);
      window.dispatchEvent(
        new CustomEvent("produktive:label-created", {
          detail: { id: response.label.id },
        }),
      );
      toast.success("Label created");
      close();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create label",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      {!headless ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
        >
          <span aria-hidden>+</span>
          New label
        </button>
      ) : null}

      <Dialog open={open} onClose={close} className="w-full max-w-[420px]">
        <form onSubmit={submit} className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: labelColorHex[color] }}
            />
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Label name (e.g. bug)"
              required
              maxLength={48}
              className="h-9 w-full rounded-md border border-border bg-bg px-3 text-[14px] text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {labelColorOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={`Color ${option}`}
                className={cn(
                  "size-5 rounded-full transition-shadow",
                  color === option
                    ? "ring-2 ring-fg ring-offset-2 ring-offset-bg"
                    : "hover:ring-1 hover:ring-border",
                )}
                style={{ backgroundColor: labelColorHex[option] }}
              />
            ))}
          </div>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional description — what does this label mean?"
            rows={2}
            className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-[12.5px] text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
          />

          <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={close}
              className="h-8 rounded-md px-3 text-[12.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="h-8 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create label"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
