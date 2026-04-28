import { useState } from "react";
import {
  CopyIcon,
  PlayIcon,
  RefreshIcon,
  SendIcon,
  ThumbsUpIcon,
} from "@/components/chat/icons";
import { type ChatAttachment, formatBytes } from "@/lib/chat-attachments";
import { cn } from "@/lib/utils";

export type ChatRole = "user" | "assistant";

export type ChatIssueCard = {
  id: string;
  status: "todo" | "in-progress" | "done";
  label: string;
  priority: string;
};

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content?: React.ReactNode;
  rawContent?: string;
  attachments?: ChatAttachment[];
  toolCalls?: ChatToolCall[];
  time?: string;
  typing?: boolean;
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: string;
  result?: unknown;
};

export function ChatMessageItem({
  message,
  onCopy,
  onRegenerate,
  onGood,
  actionState,
  onAnswerQuestion,
  pendingAnswer,
}: {
  message: ChatMessage;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onGood?: () => void;
  actionState?: "copied" | "liked" | null;
  onAnswerQuestion?: (answer: string) => void;
  pendingAnswer?: string | null;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "group flex animate-fade-up",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn("flex min-w-0 flex-col gap-1.5", isUser && "items-end")}
      >
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          {message.time ? <span>{message.time}</span> : null}
        </div>
        <div
          className={cn(
            "max-w-full text-[14px] leading-[1.65] text-fg text-pretty",
            isUser &&
              "max-w-110 rounded-lg border border-border bg-surface/80 px-3.5 py-2.5",
            !isUser && "max-w-170",
          )}
        >
          {message.typing ? (
            <span className="inline-flex items-center gap-2.5 py-1 text-fg-muted">
              <span className="text-shimmer font-medium">Thinking</span>
            </span>
          ) : (
            <>
              {message.toolCalls?.length ? (
                <ToolCallList
                  toolCalls={message.toolCalls}
                  onAnswerQuestion={onAnswerQuestion}
                  pendingAnswer={pendingAnswer ?? null}
                />
              ) : null}
              {message.content}
              {message.attachments?.length ? (
                <ChatAttachmentList attachments={message.attachments} />
              ) : null}
            </>
          )}
        </div>
        {message.role === "assistant" && !message.typing && message.rawContent ? (
          <div className="mt-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <ActionButton
              title={actionState === "copied" ? "Copied" : "Copy"}
              onClick={onCopy}
              active={actionState === "copied"}
            >
              <CopyIcon />
            </ActionButton>
            <ActionButton title="Regenerate" onClick={onRegenerate}>
              <RefreshIcon />
            </ActionButton>
            <ActionButton
              title={actionState === "liked" ? "Marked good" : "Good response"}
              onClick={onGood}
              active={actionState === "liked"}
            >
              <ThumbsUpIcon />
            </ActionButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallList({
  toolCalls,
  onAnswerQuestion,
  pendingAnswer,
}: {
  toolCalls: ChatToolCall[];
  onAnswerQuestion?: (answer: string) => void;
  pendingAnswer?: string | null;
}) {
  const askUserCalls = toolCalls.filter((tc) => tc.name === "ask_user");
  const otherCalls = toolCalls.filter((tc) => tc.name !== "ask_user");
  const groups = groupConsecutive(otherCalls);

  return (
    <>
      {groups.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {groups.map((group, index) => (
            <ToolCallChip key={`${group.name}-${index}`} group={group} />
          ))}
        </div>
      ) : null}
      {askUserCalls.map((call) => (
        <AskUserCard
          key={call.id}
          call={call}
          onAnswer={onAnswerQuestion}
          submittedAnswer={pendingAnswer}
        />
      ))}
    </>
  );
}

type ToolCallGroup = { name: string; calls: ChatToolCall[] };

function groupConsecutive(toolCalls: ChatToolCall[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = [];
  for (const call of toolCalls) {
    const last = groups[groups.length - 1];
    if (last && last.name === call.name) {
      last.calls.push(call);
    } else {
      groups.push({ name: call.name, calls: [call] });
    }
  }
  return groups;
}

function ToolCallChip({ group }: { group: ToolCallGroup }) {
  const count = group.calls.length;
  const errorCount = group.calls.filter((c) => isErrorResult(c.result)).length;
  const allErrored = errorCount > 0 && errorCount === count;
  const summary = aggregateSummary(group.calls);

  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-[5px] border border-border-subtle bg-surface/40 py-[2px] pl-1 pr-1.5 text-[11px] leading-none"
      title={summary ?? group.name}
    >
      <span
        className={cn(
          "grid size-[13px] shrink-0 place-items-center rounded-[3px]",
          allErrored ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent",
        )}
      >
        <PlayIcon size={7} />
      </span>
      <span className="truncate font-mono text-fg-muted">{group.name}</span>
      {count > 1 ? (
        <span className="grid h-[14px] min-w-[16px] place-items-center rounded-full bg-accent/20 px-1 font-mono text-[9.5px] font-medium tabular-nums text-accent">
          ×{count}
        </span>
      ) : null}
      {summary ? (
        <span
          className={cn(
            "truncate",
            allErrored ? "text-danger/80" : "text-fg-faint",
          )}
        >
          {summary}
        </span>
      ) : null}
    </span>
  );
}

function aggregateSummary(calls: ChatToolCall[]): string | null {
  if (calls.length === 1) return summarizeResult(calls[0].result);

  const errorCount = calls.filter((c) => isErrorResult(c.result)).length;
  if (errorCount === calls.length) return `${errorCount} errored`;
  if (errorCount > 0) {
    return `${calls.length - errorCount} ok · ${errorCount} errored`;
  }

  const summaries = calls
    .map((c) => summarizeResult(c.result))
    .filter((s): s is string => s !== null);
  if (summaries.length === 0) return null;

  if (summaries.every((s) => s === summaries[0])) return summaries[0];

  const matches = summaries.map((s) => /^(\d+)\s+(.+)$/.exec(s));
  if (
    matches.every((m): m is RegExpExecArray => m !== null) &&
    matches.every((m) => m[2] === matches[0][2])
  ) {
    const total = matches.reduce((sum, m) => sum + parseInt(m[1], 10), 0);
    return `${total} ${matches[0][2]}`;
  }

  return "all done";
}

function AskUserCard({
  call,
  onAnswer,
  submittedAnswer,
}: {
  call: ChatToolCall;
  onAnswer?: (answer: string) => void;
  submittedAnswer?: string | null;
}) {
  const args = parseAskUserPayload(call.arguments);
  const result = call.result as
    | { question?: string; options?: string[] }
    | undefined;
  const question = result?.question ?? args.question ?? "";
  const options =
    (result?.options && result.options.length > 0
      ? result.options
      : args.options) ?? [];
  const answered = Boolean(submittedAnswer);
  const [draft, setDraft] = useState("");

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || answered || !onAnswer) return;
    onAnswer(trimmed);
  };

  return (
    <div className="my-3 rounded-[10px] border border-accent/30 bg-accent/[0.06] p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-accent">
        <span aria-hidden="true">?</span>
        Question
      </div>
      <p className="m-0 mb-3 text-[14px] leading-snug text-fg">{question}</p>

      {answered ? (
        <div className="rounded-[7px] border border-border-subtle bg-surface/60 px-2.5 py-2 text-[13px] text-fg-muted">
          <span className="mr-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            You
          </span>
          {submittedAnswer}
        </div>
      ) : options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => submit(option)}
              disabled={!onAnswer}
              className="inline-flex h-8 items-center rounded-[7px] border border-border bg-surface px-2.5 text-[12.5px] text-fg transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!onAnswer}
            placeholder="Type your answer…"
            className="h-9 min-w-0 flex-1 rounded-[7px] border border-border bg-bg px-2.5 text-[13px] text-fg placeholder:text-fg-faint outline-none transition-colors focus:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={!onAnswer || !draft.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send answer"
          >
            <SendIcon size={12} />
          </button>
        </form>
      )}
    </div>
  );
}

function parseAskUserPayload(raw: string): {
  question?: string;
  options?: string[];
} {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as { question?: string; options?: string[] };
    }
  } catch {
    // ignore — return empty
  }
  return {};
}

function isErrorResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in (result as Record<string, unknown>)
  );
}

function summarizeResult(result: unknown): string | null {
  if (result === undefined) return "Pending";
  if (result === null) return null;

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if ("error" in obj) {
      const error = obj.error;
      return typeof error === "string" ? error : "Error";
    }
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        const noun = key.replace(/_/g, " ");
        return `${value.length} ${noun}`;
      }
    }
    if (Array.isArray(result)) {
      return `${(result as unknown[]).length} items`;
    }
    return "Done";
  }
  return null;
}

function ChatAttachmentList({
  attachments,
}: {
  attachments: ChatAttachment[];
}) {
  return (
    <div className="mt-2 grid gap-px overflow-hidden rounded-[7px] border border-border-subtle bg-border-subtle">
      {attachments.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="block bg-bg"
        >
          {isImageAttachment(file) ? (
            <figure className="m-0">
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="max-h-[360px] w-full rounded-[6px] object-contain"
              />
              <figcaption className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-2.5 py-2">
                <span className="truncate font-mono text-[10px] text-fg-muted">
                  {file.name}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">
                  {formatBytes(file.size)}
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2">
              <div className="min-w-0">
                <p className="m-0 truncate font-mono text-[11px] leading-tight text-fg">
                  {file.name}
                </p>
                <p className="m-0 mt-1 truncate font-mono text-[10px] leading-tight text-fg-faint">
                  {file.type || "application/octet-stream"}
                </p>
              </div>
              <span className="font-mono text-[10px] text-fg-muted">
                {formatBytes(file.size)}
              </span>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

function isImageAttachment(file: ChatAttachment) {
  return file.type.startsWith("image/");
}

function ActionButton({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "grid size-6 place-items-center rounded-[5px] transition-colors hover:bg-surface hover:text-fg",
        active ? "bg-surface text-fg" : "text-fg-faint",
      )}
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
