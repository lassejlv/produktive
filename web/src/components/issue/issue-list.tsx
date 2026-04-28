import { useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { useState } from "react";
import { StarIcon } from "@/components/chat/icons";
import { Avatar } from "@/components/issue/avatar";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type Issue } from "@/lib/api";
import { formatDate, statusLabel, statusOrder } from "@/lib/issue-constants";
import { cn } from "@/lib/utils";

export const ISSUE_DRAG_MIME = "application/x-produktive-issue";
const DRAG_MIME = ISSUE_DRAG_MIME;

export function IssueList({
  issues,
  selectedId,
  onSelect,
  onMoveToStatus,
  isFavorite,
  onToggleFavorite,
}: {
  issues: Issue[];
  selectedId: string | null;
  onSelect: (issueId: string) => void;
  onMoveToStatus?: (issueId: string, status: string) => void;
  isFavorite?: (issueId: string) => boolean;
  onToggleFavorite?: (issueId: string) => void;
}) {
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const grouped: Record<string, Issue[]> = {};
  for (const issue of issues) {
    (grouped[issue.status] ??= []).push(issue);
  }

  const handleDragStart = (
    event: React.DragEvent<HTMLLIElement>,
    issue: Issue,
  ) => {
    if (!onMoveToStatus) return;
    event.dataTransfer.setData(DRAG_MIME, issue.id);
    event.dataTransfer.setData("text/plain", issue.title);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(issue.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleGroupDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    groupStatus: string,
  ) => {
    if (!onMoveToStatus || !draggingId) return;
    const dragged = issues.find((i) => i.id === draggingId);
    if (!dragged || dragged.status === groupStatus) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget !== groupStatus) setDropTarget(groupStatus);
  };

  const handleGroupDragLeave = (
    event: React.DragEvent<HTMLDivElement>,
    groupStatus: string,
  ) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    if (dropTarget === groupStatus) setDropTarget(null);
  };

  const handleGroupDrop = (
    event: React.DragEvent<HTMLDivElement>,
    groupStatus: string,
  ) => {
    if (!onMoveToStatus) return;
    const issueId =
      event.dataTransfer.getData(DRAG_MIME) || draggingId || "";
    setDraggingId(null);
    setDropTarget(null);
    if (!issueId) return;
    const dragged = issues.find((i) => i.id === issueId);
    if (!dragged || dragged.status === groupStatus) return;
    event.preventDefault();
    onMoveToStatus(issueId, groupStatus);
  };

  return (
    <div className="animate-fade-in">
      {statusOrder
        .filter((s) => grouped[s]?.length)
        .map((groupStatus) => {
          const items = grouped[groupStatus];
          const isDropping = dropTarget === groupStatus;
          return (
            <div
              key={groupStatus}
              onDragOver={(event) => handleGroupDragOver(event, groupStatus)}
              onDragLeave={(event) => handleGroupDragLeave(event, groupStatus)}
              onDrop={(event) => handleGroupDrop(event, groupStatus)}
              className={cn(
                "transition-colors",
                isDropping && "bg-accent/5",
              )}
            >
              <div
                className={cn(
                  "sticky top-12 z-[5] flex items-center gap-2 border-b bg-bg/95 px-5 py-2 backdrop-blur transition-colors",
                  isDropping
                    ? "border-accent/60 text-accent"
                    : "border-border-subtle",
                )}
              >
                <StatusIcon status={groupStatus} />
                <span
                  className={cn(
                    "text-xs font-medium",
                    isDropping ? "text-accent" : "text-fg",
                  )}
                >
                  {statusLabel[groupStatus]}
                </span>
                <span className="text-[11px] tabular-nums text-fg-muted">
                  {items.length}
                </span>
                {isDropping ? (
                  <span className="ml-auto text-[10.5px] uppercase tracking-[0.08em] text-accent">
                    Drop to move
                  </span>
                ) : null}
              </div>
              <ul>
                {items.map((issue) => {
                  const isSelected = selectedId === issue.id;
                  const isDragging = draggingId === issue.id;
                  return (
                    <li
                      key={issue.id}
                      draggable={Boolean(onMoveToStatus)}
                      onDragStart={(event) => handleDragStart(event, issue)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "transition-opacity",
                        isDragging && "opacity-40",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(issue.id)}
                        className={cn(
                          "group/row flex w-full items-center gap-3 border-b border-border-subtle px-5 py-2 text-left transition-colors hover:bg-surface",
                          onMoveToStatus && "cursor-grab active:cursor-grabbing",
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
                        {onToggleFavorite ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={
                              isFavorite?.(issue.id) ? "Unpin issue" : "Pin issue"
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleFavorite(issue.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onToggleFavorite(issue.id);
                              }
                            }}
                            className={cn(
                              "grid size-5 shrink-0 place-items-center rounded-[4px] transition-colors hover:bg-surface-2",
                              isFavorite?.(issue.id)
                                ? "text-warning opacity-100"
                                : "text-fg-faint opacity-0 group-hover/row:opacity-100 hover:text-fg",
                            )}
                          >
                            <StarIcon
                              size={11}
                              filled={Boolean(isFavorite?.(issue.id))}
                            />
                          </span>
                        ) : null}
                        {issue.assignedTo ? (
                          <MemberPopover
                            member={issue.assignedTo}
                            stats={memberStats(issues, issue.assignedTo.id)}
                            onOpen={() =>
                              void navigate({
                                to: "/members/$memberId",
                                params: { memberId: issue.assignedTo!.id },
                              })
                            }
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

type IssueMember = NonNullable<Issue["assignedTo"]>;

function MemberPopover({
  member,
  stats,
  onOpen,
}: {
  member: IssueMember;
  stats: { assigned: number; created: number };
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleOpen = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Open ${member.name}`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={handleOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handleOpen(event);
            }
          }}
          className="grid size-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <Avatar name={member.name} image={member.image} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-0"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleOpen}
          className="block w-full rounded-lg p-3 text-left transition-colors hover:bg-surface"
        >
          <div className="flex items-start gap-3">
            <Avatar name={member.name} image={member.image} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-fg">
                {member.name}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-fg-muted">
                {member.email}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border-subtle bg-surface px-2 py-1.5">
              <div className="font-mono text-sm text-fg tabular-nums">
                {stats.assigned}
              </div>
              <div className="text-[11px] text-fg-muted">Assigned</div>
            </div>
            <div className="rounded-md border border-border-subtle bg-surface px-2 py-1.5">
              <div className="font-mono text-sm text-fg tabular-nums">
                {stats.created}
              </div>
              <div className="text-[11px] text-fg-muted">Created</div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-accent">View profile</div>
        </button>
      </PopoverContent>
    </Popover>
  );
}

function memberStats(issues: Issue[], memberId: string) {
  let assigned = 0;
  let created = 0;
  for (const issue of issues) {
    if (issue.assignedTo?.id === memberId) assigned += 1;
    if (issue.createdBy?.id === memberId) created += 1;
  }
  return { assigned, created };
}
