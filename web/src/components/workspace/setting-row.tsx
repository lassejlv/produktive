import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-fg-faint">{label}</div>
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}

export function SettingsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="grid gap-2 border-b border-border-subtle py-3 md:grid-cols-[140px_minmax(0,1fr)]"
        >
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}
