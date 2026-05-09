import { CopyIcon, PlayIcon, RefreshIcon, ThumbsUpIcon } from "@/components/chat/icons";
import type { ChatRole } from "@/lib/api";
import { type ChatAttachment, formatBytes } from "@/lib/chat-attachments";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content?: React.ReactNode;
  rawContent?: string;
  attachments?: ChatAttachment[];
  toolCalls?: ChatToolCall[];
  reasoningContent?: string;
  time?: string;
  typing?: boolean;
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: string;
  reasoningContent?: string;
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
    <div className={cn("group flex animate-fade-up", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", isUser && "items-end")}>
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          {message.time ? <span>{message.time}</span> : null}
        </div>
        <div
          className={cn(
            "max-w-full text-[14px] leading-[1.65] text-fg text-pretty",
            isUser && "max-w-110 rounded-md border border-border-subtle bg-surface/60 px-3 py-2",
            !isUser && "max-w-170",
          )}
        >
          {message.typing && !message.reasoningContent && !message.toolCalls?.length ? (
            <span className="inline-flex items-center py-1 text-fg-muted">
              <span className="text-shimmer text-[13px] font-medium">Thinking</span>
            </span>
          ) : (
            <>
              {message.reasoningContent ? (
                <ReasoningTrace content={message.reasoningContent} live={message.typing} />
              ) : null}
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
          <div className="mt-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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

function ReasoningTrace({ content, live }: { content: string; live?: boolean }) {
  const text = cleanReasoningText(content);
  if (!text) return null;

  return (
    <details className="group/reasoning mb-2.5 text-[12px] leading-[1.6] text-fg-faint" open={live}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] tracking-normal text-fg-muted marker:hidden">
        <span className={cn(live && "text-shimmer")}>
          {live ? summarizeReasoning(text) : "reasoning"}
        </span>
      </summary>
      <p className="m-0 mt-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-[12px] text-fg-faint">
        {text}
      </p>
    </details>
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
  const validToolCalls = toolCalls.filter(Boolean);
  const askUserCalls = validToolCalls.filter((tc) => tc.name === "ask_user");
  const otherCalls = validToolCalls.filter((tc) => tc.name !== "ask_user");
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
  const pendingCount = group.calls.filter((c) => c.result === undefined).length;
  const allErrored = errorCount > 0 && errorCount === count;
  const summary = aggregateSummary(group.calls);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-border-subtle/70 bg-transparent py-[3px] pl-1.5 pr-2 text-[12px] leading-none",
        pendingCount > 0 && "border-border bg-surface/50 text-fg",
        allErrored && "text-danger",
      )}
      title={summary ?? group.name}
    >
      <span
        className={cn(
          "grid size-[10px] shrink-0 place-items-center",
          pendingCount > 0 ? "text-fg" : allErrored ? "text-danger" : "text-fg-faint",
        )}
      >
        <PlayIcon size={7} />
      </span>
      <span className={cn("truncate", allErrored ? "text-danger" : "text-fg-muted")}>
        {formatToolName(group.name)}
      </span>
      {count > 1 ? (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            allErrored ? "text-danger/80" : "text-fg-faint",
          )}
        >
          {count}
        </span>
      ) : null}
      {summary ? (
        <span className={cn("truncate", allErrored ? "text-danger/80" : "text-fg-faint")}>
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

function formatToolName(name: string) {
  return name
    .replace(/^mcp__/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function AskUserCard({
  call,
  submittedAnswer,
}: {
  call: ChatToolCall;
  onAnswer?: (answer: string) => void;
  submittedAnswer?: string | null;
}) {
  if (!submittedAnswer) {
    // Unanswered questions are rendered docked above the composer (see
    // chat-pane.tsx). Don't render an inline duplicate here.
    return null;
  }

  const question = readAskUserQuestion(call);

  return (
    <p className="my-2 text-[13px] leading-snug text-fg-muted">
      <span className="mr-1.5 font-mono text-fg-faint" aria-hidden="true">
        ?
      </span>
      {question}
    </p>
  );
}

export function readAskUserQuestion(call: ChatToolCall): string {
  const args = parseAskUserPayload(call.arguments);
  const result = call.result as { question?: unknown } | undefined;
  if (typeof result?.question === "string") return result.question;
  if (typeof args.question === "string") return args.question;
  return "";
}

export function readAskUserOptions(call: ChatToolCall): string[] {
  const args = parseAskUserPayload(call.arguments);
  const result = call.result as { options?: unknown } | undefined;
  const fromResult = normalizeOptions(result?.options);
  if (fromResult.length > 0) return fromResult;
  return normalizeOptions(args.options);
}

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseAskUserPayload(raw: string): {
  question?: unknown;
  options?: unknown;
} {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as { question?: unknown; options?: unknown };
    }
  } catch {
    // ignore — return empty
  }
  return {};
}

function isErrorResult(result: unknown): boolean {
  return (
    typeof result === "object" && result !== null && "error" in (result as Record<string, unknown>)
  );
}

function summarizeResult(result: unknown): string | null {
  if (result === undefined) return "pending";
  if (result === null) return null;

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if ("error" in obj) {
      const error = obj.error;
      return typeof error === "string" ? error : "error";
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
    return "done";
  }
  return null;
}

function summarizeReasoning(value: string): string {
  const firstLine = value.split(/\n+/).map(cleanReasoningText).find(Boolean);
  if (!firstLine) return "thinking";
  return firstLine.length > 96 ? `${firstLine.slice(0, 96)}...` : firstLine;
}

function cleanReasoningText(value: string): string {
  return value
    .trim()
    .replace(/^[-–—]\s*/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/s, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function ChatAttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  return (
    <div className="mt-2 divide-y divide-border-subtle/60 overflow-hidden rounded-md border border-border-subtle">
      {attachments.map((file) => (
        <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="block bg-bg">
          {isImageAttachment(file) ? (
            <figure className="m-0">
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="max-h-[360px] w-full object-contain"
              />
              <figcaption className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-border-subtle/60 px-2.5 py-2">
                <span className="truncate font-mono text-[10px] text-fg-muted">{file.name}</span>
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
              <span className="font-mono text-[10px] text-fg-muted">{formatBytes(file.size)}</span>
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
        "grid size-6 place-items-center rounded-[5px] transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-none",
        active ? "text-fg" : "text-fg-faint",
      )}
    >
      {children}
    </button>
  );
}
