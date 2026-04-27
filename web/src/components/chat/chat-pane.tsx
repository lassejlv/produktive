import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import {
  ChatMessageItem,
  type ChatMessage,
} from "@/components/chat/chat-message";
import {
  CaretIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SparkleIcon,
} from "@/components/chat/icons";
import {
  type ChatMessageRecord,
  createChat,
  getChat,
  postChatMessage,
} from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { firstName, greetingForNow } from "@/lib/chat-history";

export function ChatPane({ chatId }: { chatId: string | null }) {
  const navigate = useNavigate();
  const session = useSession();
  const userName = session.data?.user?.name ?? "there";
  const userInitials = userName.slice(0, 2).toUpperCase();

  const [chatTitle, setChatTitle] = useState("New conversation");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convoRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef(false);

  // Load existing chat when navigating to a deep link.
  useEffect(() => {
    if (!chatId) {
      setChatTitle("New conversation");
      setMessages([]);
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const response = await getChat(chatId);
        if (!isMounted) return;
        setChatTitle(response.chat.title);
        setMessages(response.messages.map(recordToMessage));
      } catch (loadError) {
        if (!isMounted) return;
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load chat",
        );
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

  const handleSend = async (text: string) => {
    setError(null);
    stopRef.current = false;
    setBusy(true);

    // Optimistic user bubble + typing indicator.
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, time: "now" },
      { role: "assistant", typing: true },
    ]);

    try {
      let activeId = chatId;
      if (!activeId) {
        const created = await createChat();
        activeId = created.chat.id;
        setChatTitle(created.chat.title);
        await navigate({
          to: "/chat/$chatId",
          params: { chatId: activeId },
          replace: true,
        });
      }

      const response = await postChatMessage(activeId, text);

      if (stopRef.current) {
        // User pressed stop — drop the optimistic placeholder, leave their message in.
        setMessages((prev) =>
          prev.filter((m, i) => !(i === prev.length - 1 && m.typing)),
        );
        return;
      }

      // Replace the optimistic typing placeholder + user bubble with server records.
      setMessages((prev) => {
        const withoutOptimistic = prev.slice(0, -2);
        return [...withoutOptimistic, ...response.messages.map(recordToMessage)];
      });

      // First user message? The server set a title — sync it.
      if (chatTitle === "New conversation") {
        const firstUser = response.messages.find((m) => m.role === "user");
        if (firstUser) {
          setChatTitle(truncateForTab(firstUser.content));
        }
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Failed to send message",
      );
      // Drop the typing placeholder so the UI doesn't get stuck.
      setMessages((prev) => prev.filter((m) => !m.typing));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const isEmpty = messages.length === 0;
  const greeting = useMemo(() => greetingForNow(), []);

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-bg">
      <header className="flex min-h-12 items-center gap-3 border-b border-border-subtle px-5 py-[11px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-fg-muted">
          <button
            type="button"
            aria-label="Toggle sidebar"
            className="grid size-[30px] place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <SidebarIcon />
          </button>
          <span className="text-fg-faint">Chat</span>
          <span className="text-fg-faint">/</span>
          <span className="truncate font-medium text-fg">{chatTitle}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-[7px] rounded-md border border-border bg-surface px-2.5 text-xs text-fg transition-colors hover:border-[#33333a] hover:bg-surface-2"
          >
            <span className="text-fg-faint">
              <SparkleIcon />
            </span>
            <span>Produktive</span>
            <span className="font-mono text-[10.5px] text-fg-muted">v0.1</span>
            <span className="text-fg-faint">
              <CaretIcon />
            </span>
          </button>
          <button
            type="button"
            aria-label="Search"
            className="grid size-[30px] place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            aria-label="Settings"
            className="grid size-[30px] place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {error ? (
        <div className="m-5 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button
            type="button"
            className="text-fg-muted transition-colors hover:text-fg"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {isEmpty ? (
        <ChatEmptyState
          greeting={greeting}
          name={firstName(userName) ?? null}
          showSuggestions
          onPickSuggestion={(prompt) => void handleSend(prompt)}
        />
      ) : (
        <div
          ref={convoRef}
          className="flex flex-1 flex-col overflow-y-auto px-6 pb-4 pt-8"
        >
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
            {messages.map((message, index) => (
              <ChatMessageItem
                key={index}
                message={message}
                userInitials={userInitials}
              />
            ))}
          </div>
        </div>
      )}

      <ChatComposer
        busy={busy}
        onSend={(text) => void handleSend(text)}
        onStop={handleStop}
      />
    </div>
  );
}

function recordToMessage(record: ChatMessageRecord): ChatMessage {
  return {
    role: record.role,
    content: <p className="m-0 whitespace-pre-wrap">{record.content}</p>,
  };
}

function truncateForTab(text: string, max = 48) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
