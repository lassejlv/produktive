import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "@/components/chat/icons";
import { ProjectIcon } from "@/components/project/project-icon";
import { LoadingTip } from "@/components/ui/loading-tip";
import { type Project, listProjects } from "@/lib/api";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 280;
const TRIGGER_GAP = 6;
const VIEWPORT_PADDING = 8;

type ProjectPickerProps = {
  trigger: (props: { open: boolean; onClick: () => void }) => React.ReactNode;
  selectedId: string | null;
  onSelect: (projectId: string | null) => void;
  onCreateNew?: () => void;
};

export function ProjectPicker({
  trigger,
  selectedId,
  onSelect,
  onCreateNew,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    setIsLoading(true);
    void listProjects()
      .then((response) => setProjects(response.projects))
      .catch(() => {
        loadedRef.current = false;
      })
      .finally(() => setIsLoading(false));
  }, [open]);

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
    const active = projects.filter((p) => p.archivedAt === null);
    if (!trimmed) return active;
    return active.filter((project) =>
      project.name.toLowerCase().includes(trimmed),
    );
  }, [projects, query]);

  const close = () => setOpen(false);

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
                  placeholder="Search projects…"
                  className="h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
                />
              </div>
              <div className="flex max-h-[280px] flex-col overflow-auto py-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(null);
                    close();
                  }}
                  className={cn(
                    "flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors",
                    selectedId === null
                      ? "text-fg"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span className="size-5 shrink-0 rounded-[4px] border border-dashed border-border opacity-60" />
                  <span className="flex-1 truncate">No project</span>
                  {selectedId === null ? (
                    <span className="text-fg">
                      <CheckIcon size={12} />
                    </span>
                  ) : null}
                </button>
                {isLoading && projects.length === 0 ? (
                  <div className="px-3 py-2">
                    <LoadingTip compact />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">
                    No matching projects
                  </div>
                ) : (
                  filtered.map((project) => {
                    const isSelected = selectedId === project.id;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          onSelect(project.id);
                          close();
                        }}
                        className={cn(
                          "flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors",
                          isSelected
                            ? "text-fg"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <ProjectIcon
                          color={project.color}
                          icon={project.icon}
                          name={project.name}
                          size="md"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                        {isSelected ? (
                          <span className="text-fg">
                            <CheckIcon size={12} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              {onCreateNew ? (
                <div className="border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onCreateNew();
                    }}
                    className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <span className="grid size-5 place-items-center text-fg-faint">
                      +
                    </span>
                    <span>Create new project…</span>
                  </button>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
