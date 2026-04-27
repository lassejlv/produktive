import { cn } from "@/lib/utils";

export function PriorityIcon({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  const base = cn("shrink-0", className);
  if (priority === "urgent") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        className={cn(base, "text-danger")}
      >
        <rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="currentColor" />
        <rect x="6.25" y="3.5" width="1.5" height="5" fill="white" rx="0.5" />
        <rect x="6.25" y="9.5" width="1.5" height="1.5" fill="white" rx="0.5" />
      </svg>
    );
  }
  const level = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className={cn(base, "text-fg")}>
      <rect
        x="1"
        y="9"
        width="2.5"
        height="4"
        rx="0.5"
        fill={level >= 1 ? "currentColor" : "var(--color-border)"}
      />
      <rect
        x="5.75"
        y="5.5"
        width="2.5"
        height="7.5"
        rx="0.5"
        fill={level >= 2 ? "currentColor" : "var(--color-border)"}
      />
      <rect
        x="10.5"
        y="2"
        width="2.5"
        height="11"
        rx="0.5"
        fill={level >= 3 ? "currentColor" : "var(--color-border)"}
      />
    </svg>
  );
}
