import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import {
  ChatHistoryRail,
  type ChatHistoryEntry,
} from "@/components/chat/chat-history-rail";
import {
  ChatIssueCardList,
  ChatMessageItem,
  type ChatIssueCard,
  type ChatMessage,
} from "@/components/chat/chat-message";
import {
  CaretIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SparkleIcon,
} from "@/components/chat/icons";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

const SAMPLE_HISTORY: ChatHistoryEntry[] = [
  { id: "c1", title: "Plan v0.2 milestone" },
  { id: "c2", title: "Triage inbox from Friday" },
  { id: "c3", title: "Spec: command palette" },
  { id: "c4", title: "What's blocking PRD-21?" },
  { id: "c5", title: "Refactor issue list query" },
];

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const firstName = (full?: string | null) => {
  if (!full) return null;
  return full.trim().split(/\s+/)[0] || null;
};

const truncateTitle = (text: string, max = 48) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

function makeAssistantReply(prompt: string): React.ReactNode {
  const p = prompt.toLowerCase();

  if (p.includes("summar")) {
    const cards: ChatIssueCard[] = [
      {
        id: "PRD-18",
        status: "in-progress",
        label: "Issue list virtualization & keyboard nav",
        priority: "med",
      },
      {
        id: "PRD-21",
        status: "in-progress",
        label: "Self-hosted onboarding flow",
        priority: "high",
      },
      {
        id: "PRD-24",
        status: "in-progress",
        label: "Command palette MVP",
        priority: "med",
      },
    ];
    return (
      <>
        <p className="m-0 mb-3">
          Here's what's in progress across the workspace right now:
        </p>
        <ChatIssueCardList items={cards} />
        <p className="m-0">
          Two are blocked on review from <Code>@amalie</Code>. Want me to ping
          her?
        </p>
      </>
    );
  }

  if (p.includes("create")) {
    const cards: ChatIssueCard[] = [
      {
        id: "PRD-?",
        status: "todo",
        label: "Dashboard redesign — pass 1",
        priority: "med",
      },
    ];
    return (
      <>
        <p className="m-0 mb-3">
          Drafted an issue from your prompt — confirm to create:
        </p>
        <ChatIssueCardList items={cards} />
        <p className="m-0">
          I'll assign it to you and tag it <Code>design</Code>. Reply{" "}
          <Code>create</Code> to confirm or tell me what to change.
        </p>
      </>
    );
  }

  if (p.includes("find") || p.includes("assigned")) {
    const cards: ChatIssueCard[] = [
      {
        id: "PRD-12",
        status: "done",
        label: "Auth: Resend magic links",
        priority: "low",
      },
      {
        id: "PRD-18",
        status: "in-progress",
        label: "Issue list virtualization",
        priority: "med",
      },
      {
        id: "PRD-23",
        status: "todo",
        label: "Slack & webhook integration",
        priority: "med",
      },
    ];
    return (
      <>
        <p className="m-0 mb-3">Six issues assigned to you this week:</p>
        <ChatIssueCardList items={cards} />
        <p className="m-0">Three more older ones. Want me to list those too?</p>
      </>
    );
  }

  if (p.includes("triage") || p.includes("inbox")) {
    return (
      <>
        <p className="m-0 mb-3">Your inbox has 3 items. Suggested triage:</p>
        <ul className="my-2 ml-5 flex list-disc flex-col gap-[5px] text-sm leading-[1.6]">
          <li>
            <Code>PRD-31</Code> — bug from <Code>@rolf</Code>:{" "}
            <strong>high</strong>, looks like a regression in auth.
          </li>
          <li>
            <Code>PRD-32</Code> — feature request: <strong>backlog</strong>,
            nice but not urgent.
          </li>
          <li>
            <Code>PRD-33</Code> — duplicate of <Code>PRD-21</Code>, recommend
            closing.
          </li>
        </ul>
        <p className="m-0">Apply this triage?</p>
      </>
    );
  }

  return (
    <>
      <p className="m-0 mb-3">Got it. Here's what I'd do:</p>
      <ul className="my-2 ml-5 flex list-disc flex-col gap-[5px] text-sm leading-[1.6]">
        <li>
          Pull recent issues matching{" "}
          <Code>{truncateTitle(prompt, 40)}</Code>
        </li>
        <li>Group by status and priority</li>
        <li>Surface anything blocked or stale &gt; 7 days</li>
      </ul>
      <p className="m-0">Want me to run that now?</p>
    </>
  );
}

function preloadedConversation(): ChatMessage[] {
  const newCards: ChatIssueCard[] = [
    {
      id: "PRD-29",
      status: "todo",
      label: "Public changelog page",
      priority: "low",
    },
  ];
  return [
    {
      role: "user",
      content: "Plan the v0.2 milestone — what should land?",
      time: "2m ago",
    },
    {
      role: "assistant",
      time: "1m ago",
      content: (
        <>
          <p className="m-0 mb-3">
            Based on what's open and your team velocity, here's a tight v0.2
            cut:
          </p>
          <ul className="my-2 ml-5 flex list-disc flex-col gap-[5px] text-sm leading-[1.6]">
            <li>
              <Code>PRD-18</Code> Issue list virtualization (in progress)
            </li>
            <li>
              <Code>PRD-21</Code> Self-hosted onboarding (in progress)
            </li>
            <li>
              <Code>PRD-24</Code> Command palette MVP
            </li>
            <li>
              <Code>PRD-27</Code> Slack integration (cut from v0.3)
            </li>
          </ul>
          <p className="m-0">
            This puts you at ~14 points over two weeks — comfortable. Lock it?
          </p>
        </>
      ),
    },
    {
      role: "user",
      content: "Lock it. And add an issue for the changelog page.",
      time: "just now",
    },
    {
      role: "assistant",
      time: "just now",
      content: (
        <>
          <p className="m-0 mb-3">Locked v0.2 with those four issues. Created:</p>
          <ChatIssueCardList items={newCards} />
          <p className="m-0">
            Tagged <Code>marketing</Code>, unassigned. Want me to assign it?
          </p>
        </>
      ),
    },
  ];
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border-subtle bg-surface px-1.5 py-px font-mono text-[12.5px]">
      {children}
    </code>
  );
}

function ChatPage() {
  const session = useSession();
  const userName = session.data?.user?.name ?? "there";
  const userInitials = userName.slice(0, 2).toUpperCase();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("New conversation");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const convoRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (convoRef.current) {
      convoRef.current.scrollTop = convoRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (text: string) => {
    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      time: "now",
    };
    const placeholder: ChatMessage = { role: "assistant", typing: true };

    setMessages((prev) => [...prev, userMessage, placeholder]);
    if (chatTitle === "New conversation") {
      setChatTitle(truncateTitle(text));
    }
    setBusy(true);
    stopRef.current = false;

    window.setTimeout(() => {
      if (stopRef.current) {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? {
                  role: "assistant",
                  content: <p className="m-0">Stopped.</p>,
                  time: "just now",
                }
              : m,
          ),
        );
        setBusy(false);
        return;
      }
      const reply = makeAssistantReply(text);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? { role: "assistant", content: reply, time: "just now" }
            : m,
        ),
      );
      setBusy(false);
    }, 900);
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const handleNewChat = () => {
    setMessages([]);
    setChatTitle("New conversation");
    setActiveChatId(null);
    setBusy(false);
  };

  const handleSelectChat = (id: string) => {
    const found = SAMPLE_HISTORY.find((h) => h.id === id);
    setActiveChatId(id);
    setChatTitle(found?.title ?? "Conversation");
    setBusy(false);
    if (id === "c1") {
      setMessages(preloadedConversation());
    } else {
      setMessages([]);
    }
  };

  const isEmpty = useMemo(() => messages.length === 0, [messages.length]);
  const greeting = useMemo(() => greetingForNow(), []);

  return (
    <div className="flex h-screen min-w-0">
      <ChatHistoryRail
        history={SAMPLE_HISTORY}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
      />

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

        {isEmpty ? (
          <ChatEmptyState
            greeting={greeting}
            name={firstName(userName) ?? null}
            showSuggestions
            onPickSuggestion={handleSend}
          />
        ) : (
          <div ref={convoRef} className="flex flex-1 flex-col overflow-y-auto px-6 pb-4 pt-8">
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

        <ChatComposer busy={busy} onSend={handleSend} onStop={handleStop} />
      </div>
    </div>
  );
}
