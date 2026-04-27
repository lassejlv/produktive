import { Avatar } from "@/components/issue/avatar";
import { PillSelect } from "@/components/issue/pill-select";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { Button } from "@/components/ui/button";
import { type Issue } from "@/lib/api";
import {
  formatDate,
  priorityOptions,
  statusOptions,
} from "@/lib/issue-constants";

export function IssueDetailPanel({
  issue,
  onClose,
  onStatusChange,
  onPriorityChange,
  onDelete,
}: {
  issue: Issue;
  onClose: () => void;
  onStatusChange: (next: string) => void;
  onPriorityChange: (next: string) => void;
  onDelete: () => void;
}) {
  return (
    <aside className="hidden w-[360px] shrink-0 border-l border-border-subtle bg-surface lg:block animate-fade-in">
      <div className="sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <span className="font-mono text-[11px] text-fg-muted">
            P-{issue.id.slice(0, 4).toUpperCase()}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label="Close detail panel"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <h3 className="text-base font-medium text-fg">{issue.title}</h3>
          {issue.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">
              {issue.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-fg-faint italic">No description.</p>
          )}
        </div>

        <div className="border-t border-border-subtle p-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
            Properties
          </p>
          <dl className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-fg-muted">Status</dt>
              <dd>
                <PillSelect
                  ariaLabel="Status"
                  value={issue.status}
                  onChange={onStatusChange}
                  options={statusOptions}
                  icon={<StatusIcon status={issue.status} />}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-fg-muted">Priority</dt>
              <dd>
                <PillSelect
                  ariaLabel="Priority"
                  value={issue.priority}
                  onChange={onPriorityChange}
                  options={priorityOptions}
                  icon={<PriorityIcon priority={issue.priority} />}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-fg-muted">Assignee</dt>
              <dd className="text-xs text-fg">
                {issue.assignedTo ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar
                      name={issue.assignedTo.name}
                      image={issue.assignedTo.image}
                    />
                    {issue.assignedTo.name}
                  </span>
                ) : (
                  <span className="text-fg-muted">Unassigned</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-fg-muted">Updated</dt>
              <dd className="font-mono text-[11px] text-fg-muted">
                {formatDate(issue.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-border-subtle p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onDelete}
          >
            Delete issue
          </Button>
        </div>
      </div>
    </aside>
  );
}
