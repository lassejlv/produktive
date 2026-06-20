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
      {accent && !loading && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      )}
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] font-medium">
        {loading ? <span className="shimmer h-2.5 w-20 rounded-[var(--radius-sm)]" /> : label}
      </div>
      {loading ? (
        <div className="shimmer mt-3 h-6 w-24 rounded-[var(--radius-sm)]" />
      ) : (
        <div
          className="mt-2 text-[24px] leading-none font-medium tracking-tight tabular text-[var(--color-fg)]"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
      )}
      {sub && !loading && (
        <div className="mt-1.5 text-[11px] text-[var(--color-fg-muted)] tabular">{sub}</div>
      )}
      {loading && <div className="shimmer mt-2.5 h-2.5 w-16 rounded-[var(--radius-sm)]" />}
    </div>
  );
}
