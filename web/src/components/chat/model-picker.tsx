import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretIcon, CheckIcon } from "@/components/chat/icons";
import type { AiModel } from "@/lib/api";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 240;
const TRIGGER_GAP = 6;
const VIEWPORT_PADDING = 8;

type Props = {
  value: string | null;
  models: AiModel[];
  onChange: (modelId: string) => void;
  disabled?: boolean;
};

export function ModelPicker({
  value,
  models,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
      const left = Math.min(Math.max(rect.left, VIEWPORT_PADDING), maxLeft);
      const bottom = window.innerHeight - rect.top + TRIGGER_GAP;
      setCoords({ left, bottom });
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

  const active = models.find((model) => model.id === value) ?? null;
  const label = active?.name ?? "Model";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={`Model: ${label}`}
        disabled={disabled || models.length === 0}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-6 max-w-[160px] items-center gap-1 rounded-[5px] px-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          open
            ? "bg-surface-2 text-fg"
            : "text-fg-muted hover:bg-surface hover:text-fg",
        )}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-fg-faint">
          <CaretIcon />
        </span>
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              style={{
                position: "fixed",
                left: coords.left,
                bottom: coords.bottom,
                width: POPOVER_WIDTH,
              }}
              className="z-50 overflow-hidden rounded-[10px] border border-border bg-surface text-xs shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up"
            >
              <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                Model
              </div>
              <div className="flex flex-col py-1">
                {models.map((model) => {
                  const selected = model.id === value;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onChange(model.id);
                        setOpen(false);
                      }}
                      style={{ fontSize: 12, lineHeight: 1.3 }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                        selected
                          ? "bg-surface-2 text-fg"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <span
                        className="block min-w-0 flex-1 truncate text-fg"
                      >
                        {model.name}
                      </span>
                      {model.isDefault ? (
                        <span
                          style={{ fontSize: 10 }}
                          className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 uppercase tracking-[0.08em] text-fg-faint"
                        >
                          Default
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="shrink-0 text-fg">
                          <CheckIcon size={12} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
