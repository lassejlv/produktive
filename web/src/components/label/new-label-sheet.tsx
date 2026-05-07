import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { type Label, createLabel } from "@/lib/api";
import {
  defaultLabelColor,
  labelColorHex,
  labelColorOptions,
} from "@/lib/label-constants";
import { cn } from "@/lib/utils";

type NewLabelSheetProps = {
  onCreated?: (label: Label) => void;
  /** When true, the trigger button is not rendered — opens via custom event only. */
  headless?: boolean;
};

export function NewLabelSheet({ onCreated, headless }: NewLabelSheetProps) {
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
        <Button size="sm" onClick={() => setOpen(true)}>
          New label
        </Button>
      ) : null}

      <Sheet open={open} onClose={close} side="right">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>New label</SheetTitle>
            <SheetClose onClose={close} />
          </SheetHeader>

          <SheetContent>
            <div className="px-5 pt-5 pb-1">
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
                  placeholder="Label name"
                  required
                  maxLength={48}
                  className="min-w-0 flex-1 bg-transparent py-0 text-[18px] font-medium leading-snug tracking-[-0.02em] text-fg outline-none placeholder:text-fg-faint"
                />
              </div>
            </div>

            <div className="relative mt-4 px-5 pb-4 pt-3">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <p className="mb-2 text-[11.5px] font-medium text-fg-muted">Color</p>
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
            </div>

            <div className="relative px-5 pb-6 pt-4">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              <p className="mb-2 text-[11.5px] font-medium text-fg-muted">Description</p>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does this label mean?"
                rows={3}
                className="w-full resize-none rounded-[8px] border border-border-subtle bg-surface/40 px-3 py-2 text-[12.5px] text-fg outline-none transition-colors placeholder:text-fg-faint hover:border-border hover:bg-surface/60 focus:border-accent/60 focus:bg-surface focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </SheetContent>

          <SheetFooter>
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
              disabled={!name.trim() || submitting}
            >
              {submitting ? <Spinner size={11} /> : "Create label"}
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </>
  );
}
