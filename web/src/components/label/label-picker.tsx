import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { CheckIcon } from "@/components/chat/icons";
import {
  type Label,
  type LabelSummary,
  createLabel,
  listLabels,
} from "@/lib/api";
import { labelColorHex } from "@/lib/label-constants";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 280;
const TRIGGER_GAP = 6;
const VIEWPORT_PADDING = 8;

type LabelPickerProps = {
  trigger: (props: { open: boolean; onClick: () => void }) => React.ReactNode;
  /** Currently-selected label ids. */
  selectedIds: string[];
  /** Called whenever the selection set changes. */
  onChange: (ids: string[]) => void;
  /** Optional callback fired with the newly attached LabelSummary
   *  (so callers can hydrate label chips without an extra refetch). */
  onLabelAttached?: (label: LabelSummary) => void;
};

export function LabelPicker({
  trigger,
  selectedIds,
  onChange,
  onLabelAttached,
}: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    setIsLoading(true);
    try {
      const response = await listLabels(false);
      setLabels(response.labels);
    } catch {
      // ignore — picker stays empty if list fails
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open]);

  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("produktive:label-created", handler);
    window.addEventListener("produktive:label-updated", handler);
    return () => {
      window.removeEventListener("produktive:label-created", handler);
      window.removeEventListener("produktive:label-updated", handler);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
      const left = Math.min(Math.max(rect.left, VIEWPORT_PADDING), maxLeft);
      const top = rect.bottom + TRIGGER_GAP;
      setCoords({ left, top });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return labels;
    return labels.filter((label) =>
      label.name.toLowerCase().includes(trimmed),
    );
  }, [labels, query]);

  const exactMatch = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return false;
    return labels.some((label) => label.name.toLowerCase() === trimmed);
  }, [labels, query]);

  const toggle = (labelId: string) => {
    if (selectedIds.includes(labelId)) {
      onChange(selectedIds.filter((id) => id !== labelId));
    } else {
      onChange([...selectedIds, labelId]);
    }
  };

  const inlineCreate = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const response = await createLabel({ name });
      onLabelAttached?.({
        id: response.label.id,
        name: response.label.name,
        color: response.label.color,
      });
      onChange([...selectedIds, response.label.id]);
      window.dispatchEvent(
        new CustomEvent("produktive:label-created", {
          detail: { id: response.label.id },
        }),
      );
      setQuery("");
      void reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create label",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return;
      const match = labels.find(
        (l) => l.name.toLowerCase() === trimmed,
      );
      if (match) {
        toggle(match.id);
        setQuery("");
      } else {
        void inlineCreate();
      }
    }
  };

  return (
    <>
      <div ref={triggerRef} className="inline-block">
        {trigger({
          open,
          onClick: () => setOpen((value) => !value),
        })}
      </div>

      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              style={{
                position: "fixed",
                left: coords.left,
                top: coords.top,
                width: POPOVER_WIDTH,
              }}
              className="z-50 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up"
            >
              <div className="border-b border-border-subtle p-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search or create…"
                  className="h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
                />
              </div>
              <div className="flex max-h-[280px] flex-col overflow-auto py-1">
                {isLoading && labels.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">
                    Loading…
                  </div>
                ) : filtered.length === 0 && !query.trim() ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">
                    No labels yet — type to create one.
                  </div>
                ) : (
                  filtered.map((label) => {
                    const selected = selectedIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => toggle(label.id)}
                        className={cn(
                          "flex h-8 items-center gap-2.5 px-3 text-left text-[12.5px] transition-colors",
                          selected
                            ? "text-fg"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-3.5 place-items-center rounded-[3px] border transition-colors",
                            selected
                              ? "border-accent bg-accent text-bg"
                              : "border-border-subtle bg-transparent",
                          )}
                        >
                          {selected ? <CheckIcon size={9} /> : null}
                        </span>
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              labelColorHex[label.color] ?? labelColorHex.gray,
                          }}
                        />
                        <span className="flex-1 truncate">{label.name}</span>
                        {label.issueCount > 0 ? (
                          <span className="text-[10.5px] tabular-nums text-fg-faint">
                            {label.issueCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
                {query.trim() && !exactMatch ? (
                  <button
                    type="button"
                    onClick={() => void inlineCreate()}
                    disabled={creating}
                    className="flex h-8 items-center gap-2.5 border-t border-border-subtle px-3 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
                  >
                    <span className="grid size-3.5 place-items-center text-fg-faint">
                      +
                    </span>
                    <span className="flex-1 truncate">
                      Create{" "}
                      <span className="text-fg">"{query.trim()}"</span>
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(
                      new CustomEvent("produktive:new-label", {
                        detail: { name: query.trim() || undefined },
                      }),
                    );
                  }}
                  className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[11.5px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  Create new label with options…
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
