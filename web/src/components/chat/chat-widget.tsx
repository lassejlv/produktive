import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChatComposer,
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
import {
  CaretIcon,
  CheckIcon,
  ExpandIcon,
  PlusIcon,
  SparkleIcon,
} from "@/components/chat/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useChats } from "@/lib/use-chats";
import { cn } from "@/lib/utils";

const WIDGET_CHAT_ID_KEY = "produktive:widget-chat-id";
const MODEL_STORAGE_KEY = "produktive:chat-model";

export function ChatWidget() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");

  const navigate = useNavigate();
  const session = useSession();
  const userName = session.data?.user?.name ?? null;
  const { chats, prependChat, refresh: refreshChats } = useChats();

  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const stopRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLButtonElement | null>(null);

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
      if (
        panelRef.current?.contains(target) ||
        bubbleRef.current?.contains(target)
      ) {
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

  const renderedMessages = useMemo(
    () => collapseToolMessages(messages),
    [messages],
  );

  const handleSend = async (
    text: string,
    attachmentDrafts: ChatAttachmentDraft[] = [],
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

      const uploadedAttachments = await uploadAttachments(
        activeId,
        attachmentDrafts,
      );
      const messageText = buildOutgoingMessage(text, uploadedAttachments);

      const selectedModel =
        typeof window !== "undefined"
          ? window.localStorage.getItem(MODEL_STORAGE_KEY)
          : null;

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
                  role: "assistant",
                  content: <ChatMarkdown content={streamedText} />,
                };
              }
              return next;
            });
            return;
          }
          if (event.type === "done") {
            setMessages((prev) => {
              const withoutTyping = prev.filter((m) => !m.typing);
              const last = withoutTyping[withoutTyping.length - 1];
              const base =
                last?.role === "assistant"
                  ? withoutTyping.slice(0, -1)
                  : withoutTyping;
              return [
                ...base,
                ...event.messages
                  .filter((record) => record.role === "assistant")
                  .map(recordToMessage),
              ];
            });
            void refreshChats();
            return;
          }
          if (event.type === "error") {
            throw new Error(event.error);
          }
        },
        selectedModel ? { model: selectedModel } : undefined,
      );
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "Failed to send";
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
      void navigate({ to: "/chat/$chatId", params: { chatId } });
    } else {
      void navigate({ to: "/chat" });
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
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load chat";
      setError(message);
      toast.error(message);
    }
  };

  const currentChat = chatId
    ? chats.find((c) => c.id === chatId) ?? null
    : null;
  const headerLabel = currentChat
    ? displayChatTitle(currentChat)
    : "Assistant";

  const pendingQuestion = useMemo(
    () =>
      findPendingQuestion(renderedMessages, (answer) => void handleSend(answer)),
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
          className="fixed bottom-4 right-4 z-40 hidden size-11 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-md transition-colors hover:text-fg md:grid"
        >
          <SparkleIcon size={16} />
        </button>
      ) : (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="AI assistant"
          className="fixed bottom-4 right-4 z-40 hidden h-[600px] max-h-[calc(100vh-2rem)] w-[420px] flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg shadow-2xl animate-fade-up md:flex"
        >
          <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface"
                >
                  <span className="truncate text-[13px] font-medium text-fg">
                    {headerLabel}
                  </span>
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
                            <span className="truncate">
                              {displayChatTitle(chat)}
                            </span>
                          </ChatPickerItem>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-0.5">
              <HeaderButton
                title="New chat"
                onClick={handleNewChat}
                disabled={busy}
              >
                <PlusIcon size={13} />
              </HeaderButton>
              <HeaderButton
                title="Open in full chat"
                onClick={handleOpenInFullChat}
              >
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
                  <ChatMessageItem
                    key={message.id ?? index}
                    message={message}
                  />
                ))}
              </div>
            )}
          </div>

          {error ? (
            <div className="shrink-0 border-t border-border-subtle bg-danger/[0.08] px-3 py-2 text-[11.5px] text-danger">
              {error}
            </div>
          ) : null}

          <div className="shrink-0 border-t border-border-subtle">
            <ChatComposer
              busy={busy}
              onSend={(text, attachments) =>
                void handleSend(text, attachments)
              }
              onStop={handleStop}
              pendingQuestion={pendingQuestion}
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
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
      <p className="m-0 mt-0.5 text-[12.5px] text-fg-muted">
        what can I help with?
      </p>
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

function collapseToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let pending: ChatToolCall[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    out.push({ role: "assistant", toolCalls: pending });
    pending = [];
  };

  for (const message of messages) {
    const isToolOnly =
      message.role === "assistant" &&
      !message.typing &&
      !message.rawContent &&
      (message.toolCalls?.length ?? 0) > 0;

    if (isToolOnly) {
      pending.push(...(message.toolCalls ?? []));
      continue;
    }

    if (message.role === "assistant" && pending.length > 0) {
      out.push({
        ...message,
        toolCalls: [...pending, ...(message.toolCalls ?? [])],
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
      {leading ? (
        <span className="shrink-0 text-fg-faint">{leading}</span>
      ) : null}
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
