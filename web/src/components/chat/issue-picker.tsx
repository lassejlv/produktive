import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "@/components/chat/icons";
import { StatusIcon } from "@/components/issue/status-icon";
import { useIssues } from "@/lib/use-issues";
import { cn } from "@/lib/utils";

export type PickableIssue = {
  id: string;
  title: string;
  status: string;
  priority: string;
};

type IssuePickerProps = {
  trigger: (props: {
    open: boolean;
    onClick: () => void;
  }) => React.ReactNode;
  selectedIds: Set<string>;
  onToggle: (issue: PickableIssue) => void;
};

const POPOVER_WIDTH = 320;
const TRIGGER_GAP = 6;
const VIEWPORT_PADDING = 8;

export function IssuePicker({
  trigger,
  selectedIds,
  onToggle,
}: IssuePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { issues, isLoading, error } = useIssues();

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

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return issues.slice(0, 50);
    return issues
      .filter((issue) => {
        const title = issue.title.toLowerCase();
        const idTail = issue.id.slice(0, 8).toLowerCase();
        return title.includes(trimmed) || idTail.includes(trimmed);
      })
      .slice(0, 50);
  }, [issues, query]);

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
                bottom: coords.bottom,
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
                  placeholder="Search issues…"
                  className="h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
                />
              </div>
              <div className="flex max-h-[280px] flex-col overflow-auto pb-1">
                {error ? (
                  <div className="px-3 py-2 text-[12px] text-danger">
                    {error}
                  </div>
                ) : isLoading && issues.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">
                    Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">
                    No matching issues
                  </div>
                ) : (
                  filtered.map((issue) => {
                    const isSelected = selectedIds.has(issue.id);
                    return (
                      <button
                        key={issue.id}
                        type="button"
                        onClick={() =>
                          onToggle({
                            id: issue.id,
                            title: issue.title,
                            status: issue.status,
                            priority: issue.priority,
                          })
                        }
                        className={cn(
                          "flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors",
                          isSelected
                            ? "text-fg"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <StatusIcon status={issue.status} />
                        <span className="min-w-0 flex-1 truncate">
                          {issue.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
                          {issue.priority}
                        </span>
                        {isSelected ? (
                          <span className="shrink-0 text-fg">
                            <CheckIcon size={12} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
