import { cn } from "@/lib/utils";
import type { IssueStatus } from "@/lib/api";
import { statusCategory } from "@/lib/issue-constants";

export function StatusIcon({
  status,
  statuses,
  className,
}: {
  status: string;
  statuses?: IssueStatus[];
  className?: string;
}) {
  const base = cn("shrink-0", className);
  const category = statuses ? statusCategory(statuses, status) : status;
  switch (category) {
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
    case "active":
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
    case "canceled":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className={cn(base, "text-danger")}
        >
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M4.6 4.6l4.8 4.8M9.4 4.6L4.6 9.4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
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
