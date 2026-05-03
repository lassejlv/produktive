import { CHATS_LIMIT_OPTIONS, type ChatsSortMode } from "@/lib/use-sidebar-layout";
import { cn } from "@/lib/utils";

export function ChatsSettingsPopover({
  limit,
  sort,
  onLimitChange,
  onSortChange,
  onViewAll,
  onClose,
}: {
  limit: number;
  sort: ChatsSortMode;
  onLimitChange: (next: number) => void;
  onSortChange: (next: ChatsSortMode) => void;
  onViewAll: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-7 z-30 w-52 overflow-hidden rounded-[8px] border border-border bg-surface py-1.5 shadow-xl"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        Sort
      </div>
      <PopoverChoice label="Recent" active={sort === "recent"} onClick={() => onSortChange("recent")} />
      <PopoverChoice
        label="Alphabetical"
        active={sort === "alphabetical"}
        onClick={() => onSortChange("alphabetical")}
      />
      <div className="my-1 h-px bg-border-subtle" />
      <div className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        Show
      </div>
      <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
        {CHATS_LIMIT_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onLimitChange(value)}
            className={cn(
              "inline-flex h-6 items-center rounded-[5px] border px-1.5 text-[11px] tabular-nums transition-colors",
              limit === value
                ? "border-border bg-bg text-fg"
                : "border-border-subtle text-fg-muted hover:border-border hover:text-fg",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="my-1 h-px bg-border-subtle" />
      <button
        type="button"
        onClick={() => {
          onViewAll();
          onClose();
        }}
        className="flex h-8 w-full items-center px-2.5 text-left text-[12.5px] text-fg transition-colors hover:bg-surface-2"
      >
        View all chats
      </button>
    </div>
  );
}

function PopoverChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 w-full items-center justify-between px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
        active ? "text-fg" : "text-fg-muted",
      )}
    >
      <span>{label}</span>
      {active ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 6.2l2 2L9 3.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}
