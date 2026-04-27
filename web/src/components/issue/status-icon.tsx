import { cn } from "@/lib/utils";

export function StatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const base = cn("shrink-0", className);
  switch (status) {
    case "done":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className={cn(base, "text-success")}
        >
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path
            d="M4.3 7.1l1.9 1.9 3.5-3.5"
            stroke="white"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "in-progress":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className={cn(base, "text-accent")}
        >
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M7 1.5 A5.5 5.5 0 0 1 7 12.5 Z" fill="currentColor" />
        </svg>
      );
    case "todo":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className={cn(base, "text-fg-muted")}
        >
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      );
    case "backlog":
    default:
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className={cn(base, "text-fg-faint")}
        >
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="2.4 1.8"
          />
        </svg>
      );
  }
}
