import { useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StarIcon } from "@/components/chat/icons";
import { ProjectIcon } from "@/components/project/project-icon";
import { Avatar } from "@/components/issue/avatar";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type Issue } from "@/lib/api";
import { formatDate } from "@/lib/issue-constants";
import {
  type DisplayOptions,
  defaultDisplayOptions,
  groupIssues,
  sortIssues,
} from "@/lib/issue-display";
import { cn } from "@/lib/utils";

export const ISSUE_DRAG_MIME = "application/x-produktive-issue";
const DRAG_MIME = ISSUE_DRAG_MIME;

export type IssueListProps = {
  issues: Issue[];
  selectedId: string | null;
  focusedId?: string | null;
  selectedIds?: Set<string>;
  onSelect: (issueId: string, event: React.MouseEvent) => void;
  onMoveToStatus?: (issueId: string, status: string) => void;
  isFavorite?: (issueId: string) => boolean;
  onToggleFavorite?: (issueId: string) => void;
  displayOptions?: DisplayOptions;
  onCreateInGroup?: (status: string, title: string) => Promise<void> | void;
};

const COLLAPSED_GROUPS_KEY = "issues-collapsed-groups";

function readCollapsedGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function IssueList({
  issues,
  selectedId,
  focusedId,
  selectedIds,
  onSelect,
  onMoveToStatus,
  isFavorite,
  onToggleFavorite,
  displayOptions = defaultDisplayOptions,
  onCreateInGroup,
}: IssueListProps) {
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    () => ({}),
  );
  const [inlineCreatingKey, setInlineCreatingKey] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState("");
  const [inlineSubmitting, setInlineSubmitting] = useState(false);

  useEffect(() => {
    setCollapsedGroups(readCollapsedGroups());
  }, []);

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((current) => {
      const next = { ...current, [key]: !current[key] };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            COLLAPSED_GROUPS_KEY,
            JSON.stringify(next),
          );
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  const startInlineCreate = (key: string) => {
    setInlineCreatingKey(key);
    setInlineDraft("");
    if (collapsedGroups[key]) {
      toggleGroupCollapsed(key);
    }
  };

  const cancelInlineCreate = () => {
    setInlineCreatingKey(null);
    setInlineDraft("");
  };

  const submitInlineCreate = async (status: string) => {
    const trimmed = inlineDraft.trim();
    if (!trimmed || !onCreateInGroup) return;
    setInlineSubmitting(true);
    try {
      await onCreateInGroup(status, trimmed);
      setInlineDraft("");
    } finally {
      setInlineSubmitting(false);
    }
  };

  const groups = groupIssues(issues, displayOptions.groupBy).map((group) => ({
    ...group,
    items: sortIssues(group.items, displayOptions.sortBy),
  }));

  const properties = displayOptions.properties;
  const isCompact = displayOptions.density === "compact";
  const rowPadY = isCompact ? "py-1" : "py-1.5";

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
    groupStatus: string | null,
  ) => {
    if (!onMoveToStatus || !draggingId || !groupStatus) return;
    const dragged = issues.find((i) => i.id === draggingId);
    if (!dragged || dragged.status === groupStatus) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget !== groupStatus) setDropTarget(groupStatus);
  };

  const handleGroupDragLeave = (
    event: React.DragEvent<HTMLDivElement>,
    groupStatus: string | null,
  ) => {
    if (!groupStatus) return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    if (dropTarget === groupStatus) setDropTarget(null);
  };

  const handleGroupDrop = (
    event: React.DragEvent<HTMLDivElement>,
    groupStatus: string | null,
  ) => {
    if (!onMoveToStatus || !groupStatus) return;
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
      {groups.map((group) => {
        const isDropping = group.status !== null && dropTarget === group.status;
        const collapsed = collapsedGroups?.[group.key] ?? false;
        return (
          <div
            key={group.key}
            onDragOver={(event) => handleGroupDragOver(event, group.status)}
            onDragLeave={(event) => handleGroupDragLeave(event, group.status)}
            onDrop={(event) => handleGroupDrop(event, group.status)}
            className={cn("transition-colors", isDropping && "bg-accent/5")}
          >
            <div
              className={cn(
                "sticky top-12 z-[5] flex items-center gap-2 border-b bg-bg/95 px-5 py-2 backdrop-blur transition-colors",
                isDropping
                  ? "border-accent/60 text-accent"
                  : "border-border-subtle",
              )}
            >
              <button
                type="button"
                onClick={() => toggleGroupCollapsed(group.key)}
                aria-label={collapsed ? "Expand group" : "Collapse group"}
                className="grid size-4 place-items-center rounded-[3px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
              >
                <ChevronIcon collapsed={collapsed} />
              </button>
              {group.status ? <StatusIcon status={group.status} /> : null}
              <span
                className={cn(
                  "text-xs font-medium",
                  isDropping ? "text-accent" : "text-fg",
                )}
              >
                {group.label}
              </span>
              <span className="text-[11px] tabular-nums text-fg-muted">
                {group.items.length}
              </span>
              {isDropping ? (
                <span className="ml-auto text-[10.5px] uppercase tracking-[0.08em] text-accent">
                  Drop to move
                </span>
              ) : null}
              {onCreateInGroup && group.status && !isDropping ? (
                <button
                  type="button"
                  onClick={() => startInlineCreate(group.key)}
                  aria-label="Add issue to group"
                  className="ml-auto grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
                >
                  <PlusIcon />
                </button>
              ) : null}
            </div>
            {collapsed ? null : (
              <ul>
                {inlineCreatingKey === group.key && group.status ? (
                  <li className="border-b border-border-subtle bg-surface/40">
                    <InlineCreateRow
                      status={group.status}
                      value={inlineDraft}
                      onChange={setInlineDraft}
                      submitting={inlineSubmitting}
                      onSubmit={() => void submitInlineCreate(group.status!)}
                      onCancel={cancelInlineCreate}
                      rowPadY={rowPadY}
                    />
                  </li>
                ) : null}
                {group.items.map((issue) => {
                  const isSelected = selectedId === issue.id;
                  const isFocused = focusedId === issue.id;
                  const isMultiSelected = selectedIds?.has(issue.id) ?? false;
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
                        onClick={(event) => onSelect(issue.id, event)}
                        data-issue-row={issue.id}
                        className={cn(
                          "group/row relative flex w-full items-center gap-3 border-b border-border-subtle px-5 text-left transition-colors hover:bg-surface/60",
                          rowPadY,
                          onMoveToStatus &&
                            "cursor-grab active:cursor-grabbing",
                          isSelected && "bg-surface",
                          isMultiSelected && "bg-accent/10",
                          (isFocused || isMultiSelected) &&
                            "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-accent",
                        )}
                      >
                        {properties.priority ? (
                          <PriorityIcon priority={issue.priority} />
                        ) : null}
                        {properties.id ? (
                          <span className="font-mono text-[11px] text-fg-muted w-16 shrink-0">
                            P-{issue.id.slice(0, 4).toUpperCase()}
                          </span>
                        ) : null}
                        {properties.status ? (
                          <StatusIcon status={issue.status} />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                          {issue.title}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Copy issue link"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyIssueLink(issue.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              void copyIssueLink(issue.id);
                            }
                          }}
                          className="grid size-5 shrink-0 place-items-center rounded-[4px] text-fg-faint opacity-0 transition-colors hover:bg-surface-2 hover:text-fg group-hover/row:opacity-100"
                        >
                          <LinkIcon />
                        </span>
                        {onToggleFavorite ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={
                              isFavorite?.(issue.id)
                                ? "Unpin issue"
                                : "Pin issue"
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
                        {properties.project && issue.project ? (
                          <span
                            className="inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] border border-border-subtle bg-surface/40 px-1.5 text-[11px] text-fg-muted"
                            title={issue.project.name}
                          >
                            <ProjectIcon
                              color={issue.project.color}
                              icon={issue.project.icon}
                              name={issue.project.name}
                              size="sm"
                            />
                            <span className="hidden max-w-[100px] truncate sm:inline">
                              {issue.project.name}
                            </span>
                          </span>
                        ) : null}
                        {properties.assignee ? (
                          issue.assignedTo ? (
                            <MemberPopover
                              member={issue.assignedTo}
                              stats={memberStats(issues, issue.assignedTo.id)}
                              onOpen={() =>
                                void navigate({
                                  to: "/members/$memberId",
                                  params: {
                                    memberId: issue.assignedTo!.id,
                                  },
                                })
                              }
                            />
                          ) : (
                            <span
                              aria-label="Unassigned"
                              className="size-5 shrink-0 rounded-full border border-dashed border-border-subtle opacity-60"
                            />
                          )
                        ) : null}
                        {properties.updated ? (
                          <span className="hidden font-mono text-[11px] text-fg-muted sm:block w-12 text-right">
                            {formatDate(issue.updatedAt)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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
          className="grid size-5 shrink-0 place-items-center rounded-full transition-shadow hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
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

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
    >
      <path
        d="M3 4.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M6 2.5v7M2.5 6h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 3.5H3.5A1.5 1.5 0 002 5v2a1.5 1.5 0 001.5 1.5H5M7 3.5h1.5A1.5 1.5 0 0110 5v2a1.5 1.5 0 01-1.5 1.5H7M4 6h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

async function copyIssueLink(id: string) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/issues/${id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy link");
  }
}

function InlineCreateRow({
  status,
  value,
  onChange,
  submitting,
  onSubmit,
  onCancel,
  rowPadY,
}: {
  status: string;
  value: string;
  onChange: (next: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  rowPadY: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={cn(
        "flex w-full items-center gap-3 px-5 text-left",
        rowPadY,
      )}
    >
      <span className="size-3 shrink-0" aria-hidden />
      <span className="font-mono text-[11px] text-fg-faint w-16 shrink-0">
        new
      </span>
      <StatusIcon status={status} />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!value.trim()) onCancel();
        }}
        placeholder="Issue title…"
        disabled={submitting}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!value.trim() || submitting}
        className={cn(
          "h-6 rounded-md px-2 text-[11px] transition-colors",
          value.trim() && !submitting
            ? "bg-fg text-bg hover:bg-white"
            : "bg-surface text-fg-faint",
        )}
      >
        {submitting ? "Adding…" : "Add"}
      </button>
    </form>
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
