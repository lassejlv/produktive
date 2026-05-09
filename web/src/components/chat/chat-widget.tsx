import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChatComposer,
  type ChatSendOptions,
  type PendingQuestion,
} from "@/components/chat/chat-composer";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import {
  ChatMessageItem,
  type ChatMessage,
  type ChatToolCall,
  readAskUserOptions,
  readAskUserQuestion,
} from "@/components/chat/chat-message";
import { CaretIcon, CheckIcon, ExpandIcon, PlusIcon, SparkleIcon } from "@/components/chat/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type Chat,
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
import { firstName } from "@/lib/chat-history";
import { selectAvailableModel, useAiModels } from "@/lib/use-ai-models";
import { useChats } from "@/lib/use-chats";
import { cn } from "@/lib/utils";

const WIDGET_CHAT_ID_KEY = "produktive:widget-chat-id";
const MODEL_STORAGE_KEY = "produktive:chat-model";
const ADD_TO_WIDGET_CHAT_EVENT = "produktive:add-to-widget-chat";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD_LABEL = isMac ? "⌘" : "Ctrl";

type AddToWidgetChatEvent = CustomEvent<{
  text: string;
  source?: string;
}>;

export function ChatWidget() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const session = useSession();
  const workspaceSlug = session.data?.organization.slug ?? "";
  const chatPrefix = workspaceSlug ? `/${workspaceSlug}/chat` : "/chat";
  const isChatRoute = pathname === chatPrefix || pathname.startsWith(`${chatPrefix}/`);
  const userName = session.data?.user?.name ?? null;
  const { chats, prependChat, refresh: refreshChats } = useChats();
  const { models: availableModels, defaultId: defaultModelId } = useAiModels();
  const modelSelectionLocked = availableModels.some((model) => !model.isAvailable);

  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(MODEL_STORAGE_KEY);
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInsertion, setDraftInsertion] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const stopRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (availableModels.length === 0) return;
    const nextModel = selectAvailableModel(availableModels, defaultModelId, selectedModel);
    if (nextModel === selectedModel) return;
    setSelectedModel(nextModel);
    if (typeof window !== "undefined" && nextModel) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel);
    }
  }, [availableModels, defaultModelId, selectedModel]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_STORAGE_KEY, modelId);
    }
  };
  const draftCounterRef = useRef(0);

  // Load persisted chat once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(WIDGET_CHAT_ID_KEY);
    if (!stored) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await getChat(stored);
        if (cancelled) return;
        setChatId(stored);
        setMessages(response.messages.map(recordToMessage));
      } catch {
        if (cancelled) return;
        window.localStorage.removeItem(WIDGET_CHAT_ID_KEY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isChatRoute) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== ".") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isChatRoute]);

  useEffect(() => {
    const handleAddToChat = (event: Event) => {
      const custom = event as AddToWidgetChatEvent;
      const text = custom.detail?.text?.trim();
      if (!text) return;
      const source = custom.detail?.source?.trim();
      const content = source
        ? `From ${source}:\n\n> ${text.replace(/\n/g, "\n> ")}`
        : `> ${text.replace(/\n/g, "\n> ")}`;
      setOpen(true);
      setDraftInsertion({
        id: ++draftCounterRef.current,
        text: content,
      });
    };
    window.addEventListener(ADD_TO_WIDGET_CHAT_EVENT, handleAddToChat);
    return () => window.removeEventListener(ADD_TO_WIDGET_CHAT_EVENT, handleAddToChat);
  }, []);

  // Scroll list to bottom when messages grow or panel opens.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Click-outside + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || bubbleRef.current?.contains(target)) {
        return;
      }
      // Don't close if the click is on a portal'd popover (mention, model picker, etc.)
      // launched from inside the panel — those render outside the panel DOM tree.
      const el = event.target as HTMLElement | null;
      if (el?.closest("[data-radix-popper-content-wrapper]")) return;
      if (el?.closest("[role='dialog']")) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const renderedMessages = useMemo(() => collapseToolMessages(messages), [messages]);

  const handleSend = async (
    text: string,
    attachmentDrafts: ChatAttachmentDraft[] = [],
    sendOptions?: ChatSendOptions,
  ) => {
    setError(null);
    stopRef.current = false;
    setBusy(true);

    let activeId = chatId;
    try {
      if (!activeId) {
        const created = await createChat();
        activeId = created.chat.id;
        setChatId(activeId);
        prependChat(created.chat);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(WIDGET_CHAT_ID_KEY, activeId);
        }
      }

      const uploadedAttachments = await uploadAttachments(activeId, attachmentDrafts);
      const messageText = buildOutgoingMessage(text, uploadedAttachments);

      let streamedText = "";
      await streamChatMessage(
        activeId,
        messageText,
        (event) => {
          if (stopRef.current) return;
          if (event.type === "user") {
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
                  ...last,
                  role: "assistant",
                  typing: false,
                  content: <ChatMarkdown content={streamedText} />,
                  rawContent: streamedText,
                };
              }
              return next;
            });
            return;
          }
          if (event.type === "reasoning") {
            setMessages((prev) => updateLiveReasoning(prev, event.content));
            return;
          }
          if (event.type === "toolStart") {
            if (event.toolCall) {
              setMessages((prev) => upsertLiveToolCall(prev, event.toolCall));
            }
            return;
          }
          if (event.type === "toolResult") {
            setMessages((prev) => updateLiveToolResult(prev, event.id, event.result));
            return;
          }
          if (event.type === "done") {
            setMessages((prev) => {
              const liveAssistant = [...prev]
                .reverse()
                .find((message) => message.role === "assistant");
              const withoutTyping = prev.filter((m) => !m.typing);
              const last = withoutTyping[withoutTyping.length - 1];
              const base = last?.role === "assistant" ? withoutTyping.slice(0, -1) : withoutTyping;
              const assistantMessages = event.messages
                .filter((record) => record.role === "assistant")
                .map(recordToMessage);
              const finalAssistant = assistantMessages[assistantMessages.length - 1];
              if (finalAssistant && liveAssistant?.reasoningContent) {
                assistantMessages[assistantMessages.length - 1] = {
                  ...finalAssistant,
                  reasoningContent:
                    finalAssistant.reasoningContent ?? liveAssistant.reasoningContent,
                };
              }
              return [...base, ...assistantMessages];
            });
            void refreshChats();
            return;
          }
          if (event.type === "error") {
            throw new Error(event.error);
          }
        },
        (!modelSelectionLocked && selectedModel) || sendOptions?.reasoningEffort
          ? {
              model: modelSelectionLocked ? undefined : (selectedModel ?? undefined),
              reasoningEffort: sendOptions?.reasoningEffort,
            }
          : undefined,
      );
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Failed to send";
      setError(message);
      setMessages((prev) => prev.filter((m) => !m.typing));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const handleNewChat = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WIDGET_CHAT_ID_KEY);
    }
    setChatId(null);
    setMessages([]);
    setError(null);
    toast.message("New chat started");
  };

  const handleOpenInFullChat = () => {
    setOpen(false);
    if (chatId) {
      void navigate({
        to: "/$workspaceSlug/chat/$chatId",
        params: { workspaceSlug, chatId },
      });
    } else {
      void navigate({ to: "/$workspaceSlug/chat", params: { workspaceSlug } });
    }
  };

  const switchChat = async (id: string) => {
    setPickerOpen(false);
    if (busy || id === chatId) return;
    try {
      const response = await getChat(id);
      setChatId(id);
      setMessages(response.messages.map(recordToMessage));
      setError(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(WIDGET_CHAT_ID_KEY, id);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load chat";
      setError(message);
      toast.error(message);
    }
  };

  const currentChat = chatId ? (chats.find((c) => c.id === chatId) ?? null) : null;
  const headerLabel = currentChat ? displayChatTitle(currentChat) : "Assistant";

  const pendingQuestion = useMemo(
    () => findPendingQuestion(renderedMessages, (answer) => void handleSend(answer)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderedMessages],
  );

  if (isChatRoute) return null;

  return (
    <>
      {!open ? (
        <button
          ref={bubbleRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className={cn(
            "group fixed bottom-4 right-4 z-40 hidden h-11 w-[360px] origin-bottom-right items-center gap-2.5 rounded-full border border-border-subtle bg-bg/85 px-4 text-left backdrop-blur-md transition-all duration-200 hover:-translate-y-px hover:border-border focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:flex",
            "widget-dock-shadow animate-widget-bar",
          )}
        >
          <span className="text-fg-muted transition-colors group-hover:text-fg">
            <SparkleIcon size={13} />
          </span>
          <span className="flex-1 truncate text-[13px] text-fg-faint transition-colors group-hover:text-fg-muted">
            Ask anything…
          </span>
          <kbd className="shrink-0 select-none font-mono text-[11px] tracking-tight text-fg-faint">
            {MOD_LABEL} .
          </kbd>
        </button>
      ) : (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="AI assistant"
          className={cn(
            "fixed bottom-4 right-4 z-40 hidden h-[600px] max-h-[calc(100vh-2rem)] w-[420px] origin-bottom-right flex-col overflow-hidden rounded-[14px] border border-border-subtle/80 bg-bg/85 backdrop-blur-2xl md:flex",
            "widget-panel-shadow animate-widget-pop",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fg-muted/40 to-transparent"
          />
          <header className="relative flex h-11 shrink-0 items-center justify-between gap-2 px-3">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
            />
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface"
                >
                  <span className="truncate text-[13px] font-medium text-fg">{headerLabel}</span>
                  <span className="shrink-0 text-fg-faint">
                    <CaretIcon size={10} />
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-72 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
              >
                <ChatPickerItem
                  onClick={() => {
                    setPickerOpen(false);
                    handleNewChat();
                  }}
                  leading={<PlusIcon size={11} />}
                >
                  New chat
                </ChatPickerItem>
                {chats.length > 0 ? (
                  <>
                    <div className="my-1 h-px bg-border-subtle" />
                    <div className="max-h-[280px] overflow-y-auto">
                      {chats.slice(0, 12).map((chat) => {
                        const active = chat.id === chatId;
                        return (
                          <ChatPickerItem
                            key={chat.id}
                            onClick={() => void switchChat(chat.id)}
                            trailing={
                              active ? (
                                <span className="text-fg">
                                  <CheckIcon size={11} />
                                </span>
                              ) : (
                                <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">
                                  {formatRelative(chat.updatedAt)}
                                </span>
                              )
                            }
                          >
                            <span className="truncate">{displayChatTitle(chat)}</span>
                          </ChatPickerItem>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-0.5">
              <HeaderButton title="New chat" onClick={handleNewChat} disabled={busy}>
                <PlusIcon size={13} />
              </HeaderButton>
              <HeaderButton title="Open in full chat" onClick={handleOpenInFullChat}>
                <ExpandIcon size={13} />
              </HeaderButton>
              <HeaderButton title="Close" onClick={() => setOpen(false)}>
                <CloseGlyph />
              </HeaderButton>
            </div>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3">
            {renderedMessages.length === 0 ? (
              <WidgetEmptyState name={firstName(userName) ?? null} />
            ) : (
              <div className="flex flex-col gap-4">
                {renderedMessages.map((message, index) => (
                  <ChatMessageItem key={message.id ?? index} message={message} />
                ))}
              </div>
            )}
          </div>

          {error ? (
            <div className="relative shrink-0 bg-danger/[0.08] px-3 py-2 text-[11.5px] text-danger">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
              />
              {error}
            </div>
          ) : null}

          <div className="relative shrink-0">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
            />
            <ChatComposer
              busy={busy}
              onSend={(text, attachments, options) => void handleSend(text, attachments, options)}
              onStop={handleStop}
              models={availableModels}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              modelSelectionLocked={modelSelectionLocked}
              pendingQuestion={pendingQuestion}
              draftInsertion={draftInsertion}
            />
          </div>
        </div>
      )}
    </>
  );
}

function HeaderButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WidgetEmptyState({ name }: { name: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted">
        <SparkleIcon size={16} />
      </div>
      <h2 className="m-0 text-[15px] font-medium tracking-[-0.01em] text-fg">
        {name ? `Hi ${name},` : "Hi there,"}
      </h2>
      <p className="m-0 mt-0.5 text-[12.5px] text-fg-muted">what can I help with?</p>
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

function recordToMessage(record: ChatMessageRecord): ChatMessage {
  const parsed = parseMessageWithAttachments(record.content);
  const toolCalls = record.toolCalls ?? [];
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
    toolCalls,
    reasoningContent: toolCalls.find((call) => call.reasoningContent)?.reasoningContent,
  };
}

function updateLiveReasoning(messages: ChatMessage[], reasoningContent: string): ChatMessage[] {
  return updateLastAssistant(messages, (message) => ({
    ...message,
    typing: true,
    reasoningContent,
  }));
}

function upsertLiveToolCall(messages: ChatMessage[], toolCall: ChatToolCall): ChatMessage[] {
  return updateLastAssistant(messages, (message) => {
    const current = message.toolCalls ?? [];
    const exists = current.some((call) => call.id === toolCall.id);
    return {
      ...message,
      typing: true,
      reasoningContent: message.reasoningContent ?? toolCall.reasoningContent,
      toolCalls: exists
        ? current.map((call) => (call.id === toolCall.id ? { ...call, ...toolCall } : call))
        : [...current, toolCall],
    };
  });
}

function updateLiveToolResult(
  messages: ChatMessage[],
  id: string,
  result: ChatToolCall["result"],
): ChatMessage[] {
  return updateLastAssistant(messages, (message) => ({
    ...message,
    typing: true,
    toolCalls: (message.toolCalls ?? []).map((call) =>
      call.id === id ? { ...call, result } : call,
    ),
  }));
}

function updateLastAssistant(
  messages: ChatMessage[],
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const next = [...messages];
  const last = next[next.length - 1];
  if (last?.role === "assistant") {
    next[next.length - 1] = update(last);
  } else {
    next.push(update({ role: "assistant", typing: true }));
  }
  return next;
}

function collapseToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let pending: ChatToolCall[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    out.push({ role: "assistant", toolCalls: pending });
    pending = [];
  };

  for (const message of messages) {
    const toolCalls = (message.toolCalls ?? []).filter(Boolean);
    const isToolOnly =
      message.role === "assistant" &&
      !message.typing &&
      !message.rawContent &&
      toolCalls.length > 0;

    if (isToolOnly) {
      pending.push(...toolCalls);
      continue;
    }

    if (message.role === "assistant" && pending.length > 0) {
      out.push({
        ...message,
        toolCalls: [...pending, ...toolCalls],
        reasoningContent:
          message.reasoningContent ??
          pending.find((call) => call.reasoningContent)?.reasoningContent,
      });
      pending = [];
      continue;
    }

    if (message.role === "user") flush();
    out.push(message);
  }

  flush();
  return out;
}

function findPendingQuestion(
  messages: ChatMessage[],
  onAnswer: (answer: string) => void,
): PendingQuestion | null {
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant" || last.typing) return null;
  const askUser = last.toolCalls?.find((tc) => tc.name === "ask_user");
  if (!askUser) return null;
  return {
    question: readAskUserQuestion(askUser),
    options: readAskUserOptions(askUser),
    onAnswer,
  };
}

function ChatPickerItem({
  children,
  onClick,
  leading,
  trailing,
}: {
  children: React.ReactNode;
  onClick: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-fg transition-colors hover:bg-surface-2"
    >
      {leading ? <span className="shrink-0 text-fg-faint">{leading}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
}

function displayChatTitle(chat: Chat): string {
  return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
}

function formatRelative(value: string): string {
  const then = new Date(value).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
