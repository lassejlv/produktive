import {
  CopyIcon,
  RefreshIcon,
  ThumbsUpIcon,
} from "@/components/chat/icons";
import { cn } from "@/lib/utils";

export type ChatRole = "user" | "assistant";

export type ChatIssueCard = {
  id: string;
  status: "todo" | "in-progress" | "done";
  label: string;
  priority: string;
};

export type ChatMessage = {
  role: ChatRole;
  content?: React.ReactNode;
  time?: string;
  typing?: boolean;
};

export function ChatMessageItem({
  message,
  userInitials,
}: {
  message: ChatMessage;
  userInitials: string;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "group flex gap-3 animate-fade-up",
        isUser && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-[8px] text-[12px] font-semibold",
          isUser
            ? "border border-border bg-surface-2 text-fg"
            : "border border-border bg-bg text-fg",
        )}
      >
        {isUser ? userInitials : "P"}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1.5",
          isUser && "items-end",
        )}
      >
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          <span className="font-sans text-[12px] font-medium text-fg-muted">
            {isUser ? "You" : "Produktive"}
          </span>
          {message.time ? <span>{message.time}</span> : null}
        </div>
        <div
          className={cn(
            "max-w-full text-[14px] leading-[1.65] text-fg [text-wrap:pretty]",
            isUser &&
              "max-w-[440px] rounded-[8px] border border-border bg-surface/80 px-3.5 py-2.5",
          )}
        >
          {message.typing ? (
            <span className="inline-flex items-center gap-[3px] py-1">
              <span className="size-[5px] rounded-full bg-fg-muted animate-typing-bounce" />
              <span className="size-[5px] rounded-full bg-fg-muted animate-typing-bounce [animation-delay:0.15s]" />
              <span className="size-[5px] rounded-full bg-fg-muted animate-typing-bounce [animation-delay:0.3s]" />
            </span>
          ) : (
            message.content
          )}
        </div>
        {message.role === "assistant" && !message.typing ? (
          <div className="mt-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <ActionButton title="Copy">
              <CopyIcon />
            </ActionButton>
            <ActionButton title="Regenerate">
              <RefreshIcon />
            </ActionButton>
            <ActionButton title="Good response">
              <ThumbsUpIcon />
            </ActionButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className="grid size-6 place-items-center rounded-[5px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
    >
      {children}
    </button>
  );
}

export function ChatIssueCardList({ items }: { items: ChatIssueCard[] }) {
  return (
    <div className="my-[7px] flex flex-col gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle">
      {items.map((card) => (
        <div
          key={card.id}
          className="flex cursor-pointer items-center gap-2.5 bg-surface px-3 py-[9px] text-[13px] transition-colors hover:bg-surface-2"
        >
          <span className="w-[54px] shrink-0 font-mono text-[11px] text-fg-faint">
            {card.id}
          </span>
          <StatusDot status={card.status} />
          <span className="flex-1 truncate text-fg">{card.label}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            {card.priority}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: ChatIssueCard["status"] }) {
  if (status === "done") {
    return (
      <span className="relative size-[13px] shrink-0 rounded-full border-[1.5px] border-success bg-success">
        <svg
          className="absolute inset-0 m-auto"
          width="9"
          height="9"
          viewBox="0 0 14 14"
          fill="none"
          stroke="#0d0d0f"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3,7.5 6,10.5 11,4.5" />
        </svg>
      </span>
    );
  }
  if (status === "in-progress") {
    return (
      <span
        className="size-[13px] shrink-0 rounded-full border-[1.5px] border-warning"
        style={{
          background: "conic-gradient(var(--color-warning) 50%, transparent 0)",
        }}
      />
    );
  }
  return (
    <span className="size-[13px] shrink-0 rounded-full border-[1.5px] border-fg-muted" />
  );
}
