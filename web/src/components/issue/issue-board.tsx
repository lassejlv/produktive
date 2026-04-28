import type * as React from "react";
import { useState } from "react";
import { Avatar } from "@/components/issue/avatar";
import { ISSUE_DRAG_MIME } from "@/components/issue/issue-list";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import { type Issue } from "@/lib/api";
import {
  formatDate,
  statusLabel,
  statusOrder,
} from "@/lib/issue-constants";
import { cn } from "@/lib/utils";

export function IssueBoard({
  issues,
  onSelect,
  onMoveToStatus,
  onCreateInGroup,
}: {
  issues: Issue[];
  onSelect: (issueId: string) => void;
  onMoveToStatus?: (issueId: string, status: string) => void;
  onCreateInGroup?: (status: string, title: string) => Promise<void> | void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const buckets: Record<string, Issue[]> = {};
  for (const status of statusOrder) {
    buckets[status] = [];
  }
  for (const issue of issues) {
    (buckets[issue.status] ??= []).push(issue);
  }

  return (
    <div className="flex h-[calc(100vh-110px)] gap-3 overflow-x-auto px-5 py-4">
      {statusOrder.map((status) => {
        const items = buckets[status] ?? [];
        const isDropping = dropTarget === status;
        return (
          <Column
            key={status}
            status={status}
            items={items}
            isDropping={isDropping}
            draggingId={draggingId}
            onSelect={onSelect}
            onCreateInGroup={onCreateInGroup}
            onDragStart={(issue) => {
              setDraggingId(issue.id);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!onMoveToStatus || !draggingId) return;
              const dragged = issues.find((i) => i.id === draggingId);
              if (!dragged || dragged.status === status) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dropTarget !== status) setDropTarget(status);
            }}
            onDragLeave={(event) => {
              if (
                event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                return;
              if (dropTarget === status) setDropTarget(null);
            }}
            onDrop={(event) => {
              if (!onMoveToStatus) return;
              const issueId =
                event.dataTransfer.getData(ISSUE_DRAG_MIME) ||
                draggingId ||
                "";
              setDraggingId(null);
              setDropTarget(null);
              if (!issueId) return;
              const dragged = issues.find((i) => i.id === issueId);
              if (!dragged || dragged.status === status) return;
              event.preventDefault();
              onMoveToStatus(issueId, status);
            }}
          />
        );
      })}
    </div>
  );
}

function Column({
  status,
  items,
  isDropping,
  draggingId,
  onSelect,
  onCreateInGroup,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  status: string;
  items: Issue[];
  isDropping: boolean;
  draggingId: string | null;
  onSelect: (id: string) => void;
  onCreateInGroup?: (status: string, title: string) => Promise<void> | void;
  onDragStart: (issue: Issue) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !onCreateInGroup) return;
    setSubmitting(true);
    try {
      await onCreateInGroup(status, trimmed);
      setDraft("");
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-lg border border-border-subtle bg-surface/30 transition-colors",
        isDropping && "border-accent/50 bg-accent/5",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <StatusIcon status={status} />
        <span className="text-[12px] font-medium text-fg">
          {statusLabel[status] ?? status}
        </span>
        <span className="text-[11px] tabular-nums text-fg-faint">
          {items.length}
        </span>
        {onCreateInGroup ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="Add issue"
            className="ml-auto grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
          >
            <PlusIcon />
          </button>
        ) : null}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {creating ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="rounded-md border border-border bg-bg p-2"
          >
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCreating(false);
                  setDraft("");
                }
              }}
              onBlur={() => {
                if (!draft.trim()) {
                  setCreating(false);
                  setDraft("");
                }
              }}
              placeholder="Issue title…"
              disabled={submitting}
              className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint"
            />
          </form>
        ) : null}
        {items.map((issue) => (
          <button
            key={issue.id}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(ISSUE_DRAG_MIME, issue.id);
              event.dataTransfer.setData("text/plain", issue.title);
              event.dataTransfer.effectAllowed = "move";
              onDragStart(issue);
            }}
            onDragEnd={onDragEnd}
            onClick={() => onSelect(issue.id)}
            className={cn(
              "block w-full cursor-grab rounded-md border border-border-subtle bg-bg p-3 text-left transition-colors hover:border-border active:cursor-grabbing",
              draggingId === issue.id && "opacity-40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[10px] tracking-wide text-fg-faint">
                P-{issue.id.slice(0, 4).toUpperCase()}
              </span>
              <PriorityIcon priority={issue.priority} />
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-fg">
              {issue.title}
            </p>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-fg-muted">
              {issue.assignedTo ? (
                <Avatar
                  name={issue.assignedTo.name}
                  image={issue.assignedTo.image}
                />
              ) : (
                <span
                  aria-label="Unassigned"
                  className="size-5 rounded-full border border-dashed border-border-subtle opacity-60"
                />
              )}
              <span className="font-mono tabular-nums">
                {formatDate(issue.updatedAt)}
              </span>
            </div>
          </button>
        ))}
        {items.length === 0 && !creating ? (
          <p className="px-1 py-2 text-[11px] text-fg-faint">No issues.</p>
        ) : null}
      </div>
    </div>
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
