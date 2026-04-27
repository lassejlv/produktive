import { Avatar } from "@/components/issue/avatar";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { type Issue } from "@/lib/api";
import { formatDate, statusLabel, statusOrder } from "@/lib/issue-constants";
import { cn } from "@/lib/utils";

export function IssueList({
  issues,
  selectedId,
  onSelect,
}: {
  issues: Issue[];
  selectedId: string | null;
  onSelect: (issueId: string) => void;
}) {
  const grouped: Record<string, Issue[]> = {};
  for (const issue of issues) {
    (grouped[issue.status] ??= []).push(issue);
  }

  return (
    <div className="animate-fade-in">
      {statusOrder
        .filter((s) => grouped[s]?.length)
        .map((groupStatus) => {
          const items = grouped[groupStatus];
          return (
            <div key={groupStatus}>
              <div className="sticky top-12 z-[5] flex items-center gap-2 border-b border-border-subtle bg-bg/95 px-5 py-2 backdrop-blur">
                <StatusIcon status={groupStatus} />
                <span className="text-xs font-medium text-fg">
                  {statusLabel[groupStatus]}
                </span>
                <span className="text-[11px] tabular-nums text-fg-muted">
                  {items.length}
                </span>
              </div>
              <ul>
                {items.map((issue) => {
                  const isSelected = selectedId === issue.id;
                  return (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(issue.id)}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-border-subtle px-5 py-2 text-left transition-colors hover:bg-surface",
                          isSelected && "bg-surface",
                        )}
                      >
                        <PriorityIcon priority={issue.priority} />
                        <span className="font-mono text-[11px] text-fg-muted w-16 shrink-0">
                          P-{issue.id.slice(0, 4).toUpperCase()}
                        </span>
                        <StatusIcon status={issue.status} />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">
                          {issue.title}
                        </span>
                        {issue.assignedTo ? (
                          <Avatar
                            name={issue.assignedTo.name}
                            image={issue.assignedTo.image}
                          />
                        ) : (
                          <span className="size-5 shrink-0" />
                        )}
                        <span className="hidden font-mono text-[11px] text-fg-muted sm:block w-12 text-right">
                          {formatDate(issue.updatedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
    </div>
  );
}
