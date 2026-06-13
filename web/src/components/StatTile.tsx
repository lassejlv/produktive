import type { ReactNode } from "react";
import { cn } from "#/lib/cn";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  loading?: boolean;
  className?: string;
}

export function StatTile({ label, value, sub, accent, loading, className }: Props) {
  return (
    <div
      className={cn(
        "relative bg-[var(--color-bg-elev)] border border-[var(--color-border)]",
        "rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-xs)] overflow-hidden",
        className,
      )}
    >
      {accent && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      )}
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] font-medium">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-[24px] leading-none font-medium tracking-tight tabular text-[var(--color-fg)]",
          loading && "opacity-50",
        )}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--color-fg-muted)] tabular">{sub}</div>}
    </div>
  );
}
