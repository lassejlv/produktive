import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { SparkleIcon } from "@/components/chat/icons";
import type { PickableIssue } from "@/components/chat/issue-picker";
import { StatusIcon } from "@/components/issue/status-icon";
import type { Chat } from "@/lib/api";
import type { MentionableTool } from "@/lib/use-mcp-tools";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 320;
const VIEWPORT_PADDING = 8;
const CARET_GAP = 8;

export type MentionItem =
  | { kind: "tool"; id: string; tool: MentionableTool }
  | { kind: "issue"; id: string; issue: PickableIssue }
  | { kind: "chat"; id: string; chat: Chat };

type Props = {
  open: boolean;
  query: string;
  items: MentionItem[];
  coords: { left: number; top: number } | null;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
};

export function MentionPopup({
  open,
  query,
  items,
  coords,
  onSelect,
  onClose,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) => itemHaystack(item).includes(trimmed));
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (filtered.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % filtered.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (current) => (current - 1 + filtered.length) % filtered.length,
        );
      } else if (event.key === "Enter" || event.key === "Tab") {
        const item = filtered[activeIndex];
        if (item) {
          event.preventDefault();
          onSelect(item);
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, activeIndex, onClose, onSelect]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open || !coords) return null;

  const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
  const left = Math.min(Math.max(coords.left, VIEWPORT_PADDING), maxLeft);
  const bottom = Math.max(
    VIEWPORT_PADDING,
    window.innerHeight - coords.top + CARET_GAP,
  );
  const maxHeight = Math.min(
    POPOVER_MAX_HEIGHT,
    Math.max(160, window.innerHeight - bottom - VIEWPORT_PADDING),
  );

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      style={{
        position: "fixed",
        left,
        bottom,
        width: POPOVER_WIDTH,
        maxHeight,
      }}
      className="z-50 flex flex-col overflow-hidden rounded-[10px] border border-border bg-surface text-xs leading-tight shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up"
    >
      {items.length === 0 ? (
        <EmptyState onClose={onClose} />
      ) : filtered.length === 0 ? (
        <div className="px-3 py-2.5 text-fg-faint">No matches.</div>
      ) : (
        <div className="flex flex-col overflow-auto py-1">
          {renderRows(filtered, activeIndex, activeRowRef, onSelect)}
        </div>
      )}
    </div>,
    document.body,
  );
}

function renderRows(
  items: MentionItem[],
  activeIndex: number,
  activeRowRef: React.RefObject<HTMLButtonElement | null>,
  onSelect: (item: MentionItem) => void,
) {
  const rows: React.ReactNode[] = [];
  let currentGroupKey: string | null = null;

  items.forEach((item, index) => {
    const group = groupOf(item);
    if (group.key !== currentGroupKey) {
      currentGroupKey = group.key;
      rows.push(
        <div
          key={`group-${group.key}`}
          style={{ fontSize: 10 }}
          className="px-3 pt-2 pb-1 font-medium uppercase tracking-[0.08em] text-fg-faint"
        >
          {group.label}
        </div>,
      );
    }

    const active = index === activeIndex;
    if (item.kind === "tool") {
      rows.push(
        <ToolRow
          key={item.id}
          tool={item.tool}
          active={active}
          activeRef={active ? activeRowRef : null}
          onSelect={() => onSelect(item)}
        />,
      );
    } else if (item.kind === "issue") {
      rows.push(
        <IssueRow
          key={item.id}
          issue={item.issue}
          active={active}
          activeRef={active ? activeRowRef : null}
          onSelect={() => onSelect(item)}
        />,
      );
    } else {
      rows.push(
        <ChatRow
          key={item.id}
          chat={item.chat}
          active={active}
          activeRef={active ? activeRowRef : null}
          onSelect={() => onSelect(item)}
        />,
      );
    }
  });

  return rows;
}

function ToolRow({
  tool,
  active,
  activeRef,
  onSelect,
}: {
  tool: MentionableTool;
  active: boolean;
  activeRef: React.RefObject<HTMLButtonElement | null> | null;
  onSelect: () => void;
}) {
  return (
    <button
      ref={activeRef}
      type="button"
      onClick={onSelect}
      style={{ fontSize: 12, lineHeight: 1.3 }}
      className={cn(
        "flex w-full flex-col items-start gap-0 px-3 py-1 text-left transition-colors",
        active
          ? "bg-surface-2 text-fg"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span className="block w-full truncate font-mono text-fg">
        {prettyToolName(tool)}
      </span>
      {tool.description ? (
        <span
          style={{ fontSize: 11 }}
          className="block w-full truncate text-fg-faint"
        >
          {tool.description}
        </span>
      ) : null}
    </button>
  );
}

function IssueRow({
  issue,
  active,
  activeRef,
  onSelect,
}: {
  issue: PickableIssue;
  active: boolean;
  activeRef: React.RefObject<HTMLButtonElement | null> | null;
  onSelect: () => void;
}) {
  return (
    <button
      ref={activeRef}
      type="button"
      onClick={onSelect}
      style={{ fontSize: 12, lineHeight: 1.3 }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1 text-left transition-colors",
        active
          ? "bg-surface-2 text-fg"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <StatusIcon status={issue.status} />
      <span className="block min-w-0 flex-1 truncate text-fg">
        {issue.title}
      </span>
      <span
        style={{ fontSize: 10 }}
        className="shrink-0 font-mono text-fg-faint"
      >
        P-{issue.id.slice(0, 4).toUpperCase()}
      </span>
    </button>
  );
}

function ChatRow({
  chat,
  active,
  activeRef,
  onSelect,
}: {
  chat: Chat;
  active: boolean;
  activeRef: React.RefObject<HTMLButtonElement | null> | null;
  onSelect: () => void;
}) {
  return (
    <button
      ref={activeRef}
      type="button"
      onClick={onSelect}
      style={{ fontSize: 12, lineHeight: 1.3 }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1 text-left transition-colors",
        active
          ? "bg-surface-2 text-fg"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span className="shrink-0 text-fg-faint">
        <SparkleIcon size={11} />
      </span>
      <span className="block min-w-0 flex-1 truncate text-fg">
        {chat.title || "Untitled chat"}
      </span>
      <span
        style={{ fontSize: 10 }}
        className="shrink-0 text-fg-faint"
      >
        {relativeTime(chat.updatedAt)}
      </span>
    </button>
  );
}

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function groupOf(item: MentionItem): { key: string; label: string } {
  if (item.kind === "issue") return { key: "issues", label: "Issues" };
  if (item.kind === "chat") return { key: "chats", label: "Chats" };
  return {
    key: `tool:${item.tool.server.id}`,
    label: item.tool.server.name,
  };
}

function itemHaystack(item: MentionItem): string {
  if (item.kind === "tool") {
    const t = item.tool;
    return `${t.name} ${t.displayName} ${t.description} ${t.server.name}`.toLowerCase();
  }
  if (item.kind === "issue") {
    const i = item.issue;
    return `${i.title} ${i.id} ${i.status} ${i.priority}`.toLowerCase();
  }
  return `${item.chat.title} ${item.chat.id}`.toLowerCase();
}

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="px-3 py-3 leading-relaxed text-fg-muted">
      <p className="m-0">Nothing to mention yet.</p>
      <Link
        to="/workspace/settings"
        search={{ section: "ai" }}
        onClick={onClose}
        className="mt-1.5 inline-flex text-accent transition-colors hover:underline"
      >
        Connect an MCP server →
      </Link>
    </div>
  );
}

export function prettyToolName(tool: MentionableTool): string {
  const prefix = `mcp__${tool.server.slug}__`;
  if (tool.displayName.startsWith(prefix)) {
    return tool.displayName.slice(prefix.length);
  }
  return tool.displayName;
}
