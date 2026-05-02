import { MultiFileDiff, type FileContents } from "@pierre/diffs/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChatComposer,
  type PendingQuestion,
} from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  ChatMessageItem,
  type ChatMessage,
  type ChatToolCall,
  readAskUserOptions,
  readAskUserQuestion,
} from "@/components/chat/chat-message";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ChatMessageRecord,
  createChat,
  getChat,
  streamChatMessage,
  uploadChatAttachment,
} from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import {
  type ChatAttachment,
  type ChatAttachmentDraft,
  buildMessageWithAttachments,
  parseMessageWithAttachments,
} from "@/lib/chat-attachments";
import { firstName, greetingForNow } from "@/lib/chat-history";
import { useAiModels } from "@/lib/use-ai-models";
import { useRegisterTab } from "@/lib/use-tabs";
import { useUserPreferences } from "@/lib/use-user-preferences";
import { cn } from "@/lib/utils";

const MODEL_STORAGE_KEY = "produktive:chat-model";

export function ChatPane({ chatId }: { chatId: string | null }) {
  const navigate = useNavigate();
  const session = useSession();
  const userName = session.data?.user?.name ?? "there";

  const [chatTitle, setChatTitle] = useState("New conversation");
  const { tabsEnabled } = useUserPreferences();
  useRegisterTab({
    tabType: "chat",
    targetId: chatId ?? "",
    title: chatId ? chatTitle : null,
    enabled: tabsEnabled && Boolean(chatId),
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(Boolean(chatId));
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [likedMessageIds, setLikedMessageIds] = useState<Set<string>>(
    () => new Set(),
  );

  const convoRef = useRef<HTMLDivElement | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const skipLoadChatIdRef = useRef<string | null>(null);
  const stopRef = useRef(false);

  const { models: availableModels, defaultId: defaultModelId } = useAiModels();
  const [selectedModel, setSelectedModel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(MODEL_STORAGE_KEY);
  });

  useEffect(() => {
    if (availableModels.length === 0) return;
    const current = selectedModel
      ? availableModels.find((entry) => entry.id === selectedModel)
      : null;
    const isUsable = Boolean(current);
    if (isUsable) return;
    setSelectedModel(defaultModelId);
    if (typeof window !== "undefined" && defaultModelId) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, defaultModelId);
    }
  }, [availableModels, defaultModelId, selectedModel]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_STORAGE_KEY, modelId);
    }
  };

  // Load existing chat when navigating to a deep link.
  useEffect(() => {
    if (!chatId) {
      activeChatIdRef.current = null;
      skipLoadChatIdRef.current = null;
      setChatTitle("New conversation");
      setMessages([]);
      setIsLoadingChat(false);
      return;
    }

    if (skipLoadChatIdRef.current === chatId) {
      skipLoadChatIdRef.current = null;
      activeChatIdRef.current = chatId;
      setIsLoadingChat(false);
      return;
    }

    setIsLoadingChat(true);
    let isMounted = true;
    void (async () => {
      try {
        const response = await getChat(chatId);
        if (!isMounted) return;
        activeChatIdRef.current = chatId;
        setChatTitle(response.chat.title);
        setMessages(response.messages.map(recordToMessage));
      } catch (loadError) {
        if (!isMounted) return;
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load chat";
        setError(message);
        toast.error(message);
      } finally {
        if (isMounted) setIsLoadingChat(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [chatId]);

  useEffect(() => {
    if (convoRef.current) {
      convoRef.current.scrollTop = convoRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (
    text: string,
    attachmentDrafts: ChatAttachmentDraft[] = [],
  ) => {
    setError(null);
    stopRef.current = false;
    setBusy(true);
    let activeId = chatId;
    let createdChatId: string | null = null;
    let streamedUserId: string | null = null;
    const previousMessageCount = messages.length;

    try {
      if (!activeId) {
        const created = await createChat();
        activeId = created.chat.id;
        createdChatId = created.chat.id;
        activeChatIdRef.current = created.chat.id;
        skipLoadChatIdRef.current = created.chat.id;
        setChatTitle(created.chat.title);
        await navigate({
          to: "/chat/$chatId",
          params: { chatId: created.chat.id },
          replace: true,
        });
      }

      const uploadedAttachments = await uploadAttachments(
        activeId,
        attachmentDrafts,
      );
      const messageText = buildOutgoingMessage(text, uploadedAttachments);
      let streamedText = "";
      let receivedDone = false;

      await streamChatMessage(activeId, messageText, (event) => {
        if (stopRef.current) return;

        if (event.type === "user") {
          streamedUserId = event.message.id;
          setMessages((prev) => [
            ...prev,
            recordToMessage(event.message),
            { role: "assistant", typing: true },
          ]);
          return;
        }

        if (event.type === "delta") {
          streamedText += event.content;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                role: "assistant",
                content: <ChatMarkdown content={streamedText} />,
              };
            }
            return next;
          });
          return;
        }

        if (event.type === "done") {
          receivedDone = true;
          setMessages((prev) => {
            const withoutLoading = prev.filter((message) => !message.typing);
            const last = withoutLoading[withoutLoading.length - 1];
            const base =
              last?.role === "assistant"
                ? withoutLoading.slice(0, -1)
                : withoutLoading;
            return [
              ...base,
              ...event.messages
                .filter((record) => record.role === "assistant")
                .map(recordToMessage),
            ];
          });
          return;
        }

        if (event.type === "error") {
          if (event.messages?.length) {
            setMessages(event.messages.map(recordToMessage));
            if (
              didRecoverAssistantResponse(
                event.messages,
                streamedUserId,
                previousMessageCount,
              )
            ) {
              receivedDone = true;
              return;
            }
          }
          throw new Error(event.error);
        }
      }, selectedModel ? { model: selectedModel } : undefined);

      if (!receivedDone && stopRef.current) {
        setMessages((prev) => prev.filter((m) => !m.typing));
      }

      // First user message? The server set a title — sync it.
      if (chatTitle === "New conversation") {
        const parsed = parseMessageWithAttachments(messageText);
        setChatTitle(truncateForTab(parsed.text));
      }

      if (createdChatId) skipLoadChatIdRef.current = null;
    } catch (sendError) {
      const recoverId = activeId ?? createdChatId;
      if (recoverId) {
        try {
          const response = await getChat(recoverId);
          setChatTitle(response.chat.title);
          const recoveredMessages = response.messages.map(recordToMessage);
          setMessages(recoveredMessages);

          if (createdChatId) {
            await navigate({
              to: "/chat/$chatId",
              params: { chatId: createdChatId },
              replace: true,
            });
          }

          if (
            didRecoverAssistantResponse(
              response.messages,
              streamedUserId,
              previousMessageCount,
            )
          ) {
            setError(null);
            return;
          }
        } catch {
          // Fall through to the normal error state below.
        }
      }
      const message =
        sendError instanceof Error ? sendError.message : "Failed to send message";
      setError(message);
      toast.error(message);
      // Drop the typing placeholder so the UI doesn't get stuck.
      setMessages((prev) => prev.filter((m) => !m.typing));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (message: ChatMessage) => {
    const text = message.rawContent?.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied response");
      setCopiedMessageId(message.id ?? null);
      window.setTimeout(() => {
        setCopiedMessageId((current) =>
          current === message.id ? null : current,
        );
      }, 1400);
    } catch {
      toast.error("Failed to copy message");
      setError("Failed to copy message");
    }
  };

  const handleRegenerate = (index: number) => {
    if (busy) return;

    const previousUser = [...messages]
      .slice(0, index)
      .reverse()
      .find((message) => message.role === "user" && message.rawContent);

    if (!previousUser?.rawContent) {
      toast.error("No user message found to regenerate from");
      setError("No user message found to regenerate from");
      return;
    }

    setMessages((current) =>
      current.filter((_, messageIndex) => messageIndex !== index),
    );
    toast.message("Regenerating response");
    void handleSend(previousUser.rawContent);
  };

  const handleGoodResponse = (message: ChatMessage) => {
    if (!message.id) return;
    setLikedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(message.id!)) {
        next.delete(message.id!);
        toast.message("Feedback removed");
      } else {
        next.add(message.id!);
        toast.success("Marked as good response");
      }
      return next;
    });
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const isEmpty = messages.length === 0;
  const greeting = useMemo(() => greetingForNow(), []);
  const changes = useMemo(() => chatChangesFromMessages(messages), [messages]);
  const renderedMessages = useMemo(() => collapseToolMessages(messages), [messages]);
  const pendingQuestion = useMemo(
    () => findPendingQuestion(renderedMessages, (answer) => void handleSend(answer)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderedMessages],
  );

  return (
    <div className="flex h-screen min-w-0 flex-1 overflow-hidden bg-bg md:h-full">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-10 flex min-h-[58px] items-center gap-3 border-b border-border-subtle bg-bg/86 px-6 py-3 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-3 text-[13px] text-fg-muted">
            <span className="text-fg-muted">Chat</span>
            <span className="text-fg-muted">/</span>
            {isLoadingChat ? (
              <Skeleton className="h-3.5 w-40" />
            ) : (
              <span className="truncate font-medium text-fg">{chatTitle}</span>
            )}
          </div>
        </header>

        {isLoadingChat ? (
          <ChatSkeleton />
        ) : isEmpty ? (
          <ChatEmptyState
            greeting={greeting}
            name={firstName(userName) ?? null}
            showSuggestions
            onPickSuggestion={(prompt) => void handleSend(prompt)}
          />
        ) : (
          <div
            ref={convoRef}
            className="relative z-10 flex flex-1 flex-col overflow-y-auto px-6 pb-4 pt-8"
          >
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
              {renderedMessages.map((message, index) => {
                const followingUser = renderedMessages
                  .slice(index + 1)
                  .find((m) => m.role === "user");
                return (
                  <ChatMessageItem
                    key={message.id ?? index}
                    message={message}
                    onCopy={() => void handleCopy(message)}
                    onRegenerate={() => handleRegenerate(index)}
                    onGood={() => handleGoodResponse(message)}
                    onAnswerQuestion={(answer) => void handleSend(answer)}
                    pendingAnswer={followingUser?.rawContent ?? null}
                    actionState={
                      copiedMessageId === message.id
                        ? "copied"
                        : message.id && likedMessageIds.has(message.id)
                          ? "liked"
                          : null
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {error ? <ChatErrorNotice message={error} onDismiss={() => setError(null)} /> : null}

        <ChatComposer
          busy={busy}
          onSend={(text, attachments) => void handleSend(text, attachments)}
          onStop={handleStop}
          onOpenChanges={() => setChangesOpen((current) => !current)}
          changesCount={changes.length}
          changesOpen={changesOpen}
          pendingQuestion={pendingQuestion}
        />
      </div>
      <ChatChangesPanel
        open={changesOpen}
        changes={changes}
        onClose={() => setChangesOpen(false)}
      />
    </div>
  );
}

function ChatErrorNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="relative z-20 px-6 pb-1">
      <div className="mx-auto flex min-h-9 w-full max-w-[760px] items-center justify-between gap-3 rounded-md border border-danger/25 bg-danger/[0.08] px-3 py-2 text-[12px] text-danger">
        <span className="min-w-0 truncate">{message}</span>
        <button
          type="button"
          className="shrink-0 text-[11px] text-fg-muted transition-colors hover:text-fg"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

type ChatChange = {
  id: string;
  action: "created" | "updated" | "changed";
  title: string;
  issueId?: string;
  fields: Array<{ name: string; before?: unknown; after: unknown }>;
  result?: unknown;
};

function ChatChangesPanel({
  open,
  changes,
  onClose,
}: {
  open: boolean;
  changes: ChatChange[];
  onClose: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-bg transition-[width] duration-300 ease-out",
        open ? "w-[392px]" : "w-0 border-l-0",
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "flex h-full w-[392px] min-w-0 flex-col transition-[opacity,transform] duration-300 ease-out",
          open
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-3 opacity-0",
        )}
      >
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
              Changes
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-faint">
              {changes.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            aria-label="Close changes panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {changes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 grid size-10 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M3 7h8M7 3v8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="max-w-60 text-[13px] leading-relaxed text-fg-muted">
              No issue changes have been made from this chat yet.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {changes.map((change, idx) => (
              <article
                key={change.id}
                className={cn(
                  "border-b border-border-subtle/60",
                  idx === 0 && "border-t border-border-subtle/60",
                )}
              >
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface/50">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                      {change.action}
                    </span>
                    <p className="min-w-0 truncate text-[13px] text-fg">
                      {change.title}
                    </p>
                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-fg-faint">
                      {change.fields.length}
                    </span>
                  </div>
                  {change.issueId ? (
                    <Link
                      to="/issues/$issueId"
                      params={{ issueId: change.issueId }}
                      className="shrink-0 text-[11px] text-fg-muted transition-colors hover:text-fg"
                      onClick={onClose}
                    >
                      Open →
                    </Link>
                  ) : null}
                </div>
                {change.fields.length > 0 ? (
                  <div className="grid border-t border-border-subtle/60 bg-surface/20">
                    {change.fields.map((field) => (
                      <ChatChangeField key={field.name} field={field} />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function ChatChangeField({
  field,
}: {
  field: { name: string; before?: unknown; after: unknown };
}) {
  const name = `${fieldLabel(field.name)}.md`;
  const oldFile: FileContents = {
    name,
    contents: diffFileValue(field.before),
    lang: "markdown",
  };
  const newFile: FileContents = {
    name,
    contents: diffFileValue(field.after),
    lang: "markdown",
  };

  return (
    <div className="border-b border-border-subtle bg-bg last:border-b-0">
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        disableWorkerPool
        options={{
          theme: "pierre-dark",
          themeType: "dark",
          diffStyle: "unified",
          diffIndicators: "bars",
          disableLineNumbers: true,
          hunkSeparators: "simple",
          lineDiffType: "word-alt",
          overflow: "wrap",
        }}
        className="produktive-diff"
      />
    </div>
  );
}

async function uploadAttachments(
  chatId: string,
  drafts: ChatAttachmentDraft[],
): Promise<ChatAttachment[]> {
  return Promise.all(
    drafts.map(async ({ file }) => {
      const uploaded = await uploadChatAttachment(chatId, file);
      return {
        id: uploaded.id,
        name: uploaded.name,
        type: uploaded.contentType,
        size: uploaded.size,
        key: uploaded.key,
        url: uploaded.url,
      };
    }),
  );
}

function buildOutgoingMessage(text: string, attachments: ChatAttachment[]) {
  if (attachments.length === 0) return text.trim();

  const visibleText = text.trim() || "Review the attached files.";
  return buildMessageWithAttachments(visibleText, attachments);
}

function didRecoverAssistantResponse(
  records: ChatMessageRecord[],
  streamedUserId: string | null,
  previousMessageCount: number,
) {
  if (streamedUserId) {
    const userIndex = records.findIndex((record) => record.id === streamedUserId);
    return (
      userIndex >= 0 &&
      records.slice(userIndex + 1).some(isUsableAssistantRecord)
    );
  }

  return (
    records.length > previousMessageCount &&
    records.slice(previousMessageCount).some(isUsableAssistantRecord)
  );
}

function isUsableAssistantRecord(record: ChatMessageRecord) {
  if (record.role !== "assistant") return false;
  if (record.content.trim()) return true;
  return (record.toolCalls ?? []).some(
    (toolCall) => toolCall.name === "ask_user" || toolCall.result !== undefined,
  );
}

function recordToMessage(record: ChatMessageRecord): ChatMessage {
  const parsed = parseMessageWithAttachments(record.content);
  const content =
    record.role === "assistant" ? (
      <ChatMarkdown content={parsed.text} />
    ) : (
      <p className="m-0 whitespace-pre-wrap">{parsed.text}</p>
    );

  return {
    id: record.id,
    role: record.role,
    content,
    rawContent: record.role === "user" ? record.content : parsed.text,
    attachments: parsed.attachments,
    toolCalls: record.toolCalls ?? [],
  };
}

function chatChangesFromMessages(messages: ChatMessage[]): ChatChange[] {
  return messages.flatMap((message) =>
    (message.toolCalls ?? [])
      .filter((toolCall) => isChangeTool(toolCall.name))
      .map((toolCall) => toolCallToChange(toolCall)),
  );
}

function isChangeTool(name: string) {
  return name === "create_issue" || name === "update_issue";
}

function toolCallToChange(toolCall: ChatToolCall): ChatChange {
  const args = parsePayload(toolCall.arguments);
  const resultIssue = issueFromResult(toolCall.result);
  const resultChanges = changesFromResult(toolCall.result);
  const issueId = resultIssue?.id ?? stringField(args, "id");
  const title =
    toolCall.name === "create_issue"
      ? `Created ${resultIssue?.title ?? stringField(args, "title") ?? "issue"}`
      : `Updated ${resultIssue?.title ?? issueId ?? "issue"}`;

  return {
    id: toolCall.id,
    action: toolCall.name === "create_issue" ? "created" : "updated",
    title: title.replace(/^(Created|Updated)\s+/i, ""),
    issueId,
    fields: filterMeaningfulChanges(
      resultChanges ??
        Object.entries(args)
          .filter(([key]) => key !== "id")
          .map(([name, value]) => ({
            name,
            after: value,
          })),
    ),
    result: toolCall.result,
  };
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function issueFromResult(value: unknown) {
  if (!value || typeof value !== "object" || !("issue" in value)) return null;
  const issue = (value as { issue?: unknown }).issue;
  if (!issue || typeof issue !== "object") return null;
  return issue as Record<string, unknown> & { id?: string; title?: string };
}

function changesFromResult(value: unknown) {
  if (!value || typeof value !== "object" || !("changes" in value)) return null;
  const changes = (value as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return null;

  return changes
    .filter(
      (change): change is { field: string; before?: unknown; after: unknown } =>
        Boolean(change) &&
        typeof change === "object" &&
        typeof (change as { field?: unknown }).field === "string" &&
        "after" in change,
    )
    .map((change) => ({
      name: change.field,
      before: change.before,
      after: change.after,
    }));
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "Title",
    description: "Body",
    status: "Status",
    priority: "Priority",
    assigned_to_id: "Assignee",
    assignedToId: "Assignee",
  };
  return labels[field] ?? field;
}

function displayChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function diffFileValue(value: unknown) {
  if (isEmptyChangeValue(value)) return "";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value, null, 2);
  return text.endsWith("\n") ? text : `${text}\n`;
}

function filterMeaningfulChanges(
  fields: Array<{ name: string; before?: unknown; after: unknown }>,
) {
  return fields.filter((field) => {
    if (field.name === "id") return false;
    const before = normalizeChangeValue(field.before);
    const after = normalizeChangeValue(field.after);
    return before !== after;
  });
}

function normalizeChangeValue(value: unknown) {
  if (isEmptyChangeValue(value)) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

function isEmptyChangeValue(value: unknown) {
  return value === null || value === undefined || value === "";
}

function truncateForTab(text: string, max = 48) {
  const normalized = text.trim() || "Attached files";
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function findPendingQuestion(
  messages: ChatMessage[],
  onAnswer: (answer: string) => void,
): PendingQuestion | null {
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return null;
  if (last.typing) return null;
  const askUser = last.toolCalls?.find((tc) => tc.name === "ask_user");
  if (!askUser) return null;
  return {
    question: readAskUserQuestion(askUser),
    options: readAskUserOptions(askUser),
    onAnswer,
  };
}

// Merge a run of assistant messages whose content is empty (intermediate
// tool-call rounds) into the next assistant message that actually replies, so
// the UI shows one consolidated tool-call trace above the answer.
function collapseToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let pendingToolCalls: ChatToolCall[] = [];

  const flushAsStandalone = () => {
    if (pendingToolCalls.length === 0) return;
    out.push({ role: "assistant", toolCalls: pendingToolCalls });
    pendingToolCalls = [];
  };

  for (const message of messages) {
    const isToolOnlyAssistant =
      message.role === "assistant" &&
      !message.typing &&
      !message.rawContent &&
      (message.toolCalls?.length ?? 0) > 0;

    if (isToolOnlyAssistant) {
      pendingToolCalls.push(...(message.toolCalls ?? []));
      continue;
    }

    if (message.role === "assistant" && pendingToolCalls.length > 0) {
      out.push({
        ...message,
        toolCalls: [...pendingToolCalls, ...(message.toolCalls ?? [])],
      });
      pendingToolCalls = [];
      continue;
    }

    if (message.role === "user") {
      flushAsStandalone();
    }

    out.push(message);
  }

  flushAsStandalone();
  return out;
}
