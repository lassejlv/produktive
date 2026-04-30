import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CaretIcon, CheckIcon } from "@/components/chat/icons";
import { useGithubRepositorySearchQuery } from "@/lib/queries/github";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 340;
const TRIGGER_GAP = 6;
const VIEWPORT_PADDING = 8;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_RESULTS = 15;

type Selection = { owner: string; repo: string };

type Props = {
  selected: Selection | null;
  excludedKeys: Set<string>;
  disabled?: boolean;
  onSelect: (value: Selection) => void;
};

export function GithubRepoPicker({
  selected,
  excludedKeys,
  disabled,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(() => setDebouncedQuery(trimmed), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useGithubRepositorySearchQuery(debouncedQuery, open);

  const visible = useMemo(() => {
    const repos = searchQuery.data ?? [];
    return repos
      .filter((r) => !excludedKeys.has(`${r.owner}/${r.repo}`.toLowerCase()))
      .slice(0, MAX_RESULTS);
  }, [searchQuery.data, excludedKeys]);

  const trimmedQuery = query.trim();
  const manualMatch =
    REPO_PATTERN.test(trimmedQuery) &&
    !visible.some(
      (r) => `${r.owner}/${r.repo}`.toLowerCase() === trimmedQuery.toLowerCase(),
    ) &&
    !excludedKeys.has(trimmedQuery.toLowerCase())
      ? trimmedQuery
      : null;

  const totalOptions = visible.length + (manualMatch ? 1 : 0);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, totalOptions]);

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
    const onKey = (event: globalThis.KeyboardEvent) => {
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
      setDebouncedQuery("");
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const choose = (value: Selection) => {
    onSelect(value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (totalOptions === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % totalOptions);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + totalOptions) % totalOptions);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex < visible.length) {
        const item = visible[activeIndex];
        choose({ owner: item.owner, repo: item.repo });
      } else if (manualMatch) {
        const [owner, repo] = manualMatch.split("/");
        choose({ owner, repo });
      }
    }
  };

  const triggerLabel = selected
    ? `${selected.owner}/${selected.repo}`
    : "Choose a repository…";

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm text-fg outline-none transition-colors",
          "hover:bg-surface-2",
          "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate",
            selected ? "font-mono text-fg" : "text-fg-faint",
          )}
        >
          {triggerLabel}
        </span>
        <span className="text-fg-faint">
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
                  onKeyDown={onKeyDown}
                  placeholder="Search owner/repo…"
                  className="h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
                />
              </div>
              <div className="flex max-h-[280px] flex-col overflow-auto py-1">
                {searchQuery.isPending && !searchQuery.data ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">Loading…</div>
                ) : null}

                {searchQuery.isError ? (
                  <div className="px-3 py-2 text-[12px] text-danger">
                    {searchQuery.error?.message ?? "Failed to load repositories"}
                  </div>
                ) : null}

                {visible.map((repo, index) => {
                  const key = `${repo.owner}/${repo.repo}`;
                  const isActive = index === activeIndex;
                  const isSelected =
                    selected?.owner === repo.owner && selected.repo === repo.repo;
                  return (
                    <button
                      key={key}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose({ owner: repo.owner, repo: repo.repo })}
                      className={cn(
                        "flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors",
                        isActive ? "bg-surface-2 text-fg" : "text-fg-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">{key}</span>
                      {repo.private ? (
                        <span className="rounded-full border border-border-subtle px-1.5 text-[10px] text-fg-faint">
                          Private
                        </span>
                      ) : null}
                      {isSelected ? (
                        <span className="text-fg">
                          <CheckIcon size={12} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                {manualMatch ? (
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(visible.length)}
                    onClick={() => {
                      const [owner, repo] = manualMatch.split("/");
                      choose({ owner, repo });
                    }}
                    className={cn(
                      "flex h-9 items-center gap-2.5 border-t border-border-subtle px-3 text-left text-[13px] transition-colors",
                      activeIndex === visible.length
                        ? "bg-surface-2 text-fg"
                        : "text-fg-muted",
                    )}
                  >
                    <span className="text-fg-faint">Use</span>
                    <span className="font-mono">{manualMatch}</span>
                  </button>
                ) : null}

                {!searchQuery.isPending &&
                !searchQuery.isError &&
                visible.length === 0 &&
                !manualMatch ? (
                  <div className="px-3 py-2 text-[12px] text-fg-faint">
                    {trimmedQuery
                      ? "No matching repositories. Type owner/repo to add manually."
                      : "No repositories found."}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
