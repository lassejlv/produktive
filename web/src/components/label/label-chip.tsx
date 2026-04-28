import { labelColorHex } from "@/lib/label-constants";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

const sizeClass: Record<Size, string> = {
  sm: "h-4 gap-1 rounded-[3px] px-1.5 text-[10.5px]",
  md: "h-5 gap-1.5 rounded-[4px] px-1.5 text-[11.5px]",
};

const dotSize: Record<Size, string> = {
  sm: "size-1.5",
  md: "size-2",
};

export function LabelChip({
  name,
  color,
  size = "sm",
  className,
  onRemove,
}: {
  name: string;
  color: string;
  size?: Size;
  className?: string;
  onRemove?: () => void;
}) {
  const fg = labelColorHex[color] ?? labelColorHex.gray;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center border border-border-subtle bg-surface/40 text-fg-muted",
        sizeClass[size],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("rounded-full", dotSize[size])}
        style={{ backgroundColor: fg }}
      />
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${name}`}
          className="grid size-3 place-items-center text-fg-faint transition-colors hover:text-fg"
        >
          <svg width="7" height="7" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}
