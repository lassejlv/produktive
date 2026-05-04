import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatShare } from "@/components/chat/chat-share";
import { DotsIcon, SparkleIcon, StarIcon } from "@/components/chat/icons";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSession } from "@/lib/auth-client";
import { type Chat, deleteChat, getChat } from "@/lib/api";
import { parseMessageWithAttachments } from "@/lib/chat-attachments";
import { chatsQueryOptions } from "@/lib/queries/chats";
import { useChats } from "@/lib/use-chats";
import { useFavorites } from "@/lib/use-favorites";
import { cn } from "@/lib/utils";

type ChatsSearch = {
  q?: string;
};

export const Route = createFileRoute("/_app/chats")({
  validateSearch: (search: Record<string, unknown>): ChatsSearch => ({
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(chatsQueryOptions()),
  component: ChatsPage,
});

type SortKey = "recent" | "alphabetical" | "oldest";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "oldest", label: "Oldest" },
  { value: "alphabetical", label: "A–Z" },
];

type Bucket = "pinned" | "today" | "yesterday" | "earlier";

const bucketOrder: Bucket[] = ["pinned", "today", "yesterday", "earlier"];

const bucketLabels: Record<Bucket, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

function ChatsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { chats, isLoading, removeChat } = useChats();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { confirm, dialog } = useConfirmDialog();
  const session = useSession();
  const currentUserId = session.data?.user.id ?? null;
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState(search.q ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? chats.filter((chat) =>
          (chat.title || "").toLowerCase().includes(q),
        )
      : chats;
  }, [chats, query]);

  const groups = useMemo(() => {
    if (sort === "alphabetical") {
      const copy = [...filtered].sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", undefined, {
          sensitivity: "base",
        }),
      );
      return [{ bucket: "all" as const, chats: copy }];
    }

    if (sort === "oldest") {
      const copy = [...filtered].sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      );
      return [{ bucket: "all" as const, chats: copy }];
    }

    const buckets = new Map<Bucket, Chat[]>();
    for (const chat of filtered) {
      const bucket = isFavorite("chat", chat.id)
        ? "pinned"
        : dateBucket(chat.updatedAt);
      const list = buckets.get(bucket) ?? [];
      list.push(chat);
      buckets.set(bucket, list);
    }
    for (const list of buckets.values()) {
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return bucketOrder
      .filter((bucket) => buckets.has(bucket))
      .map((bucket) => ({ bucket, chats: buckets.get(bucket) ?? [] }));
  }, [filtered, sort, isFavorite]);

  const handleDelete = (chat: Chat) => {
    confirm({
      title: "Delete this chat?",
      description: "Messages and attachments will be removed.",
      confirmLabel: "Delete chat",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteChat(chat.id);
          removeChat(chat.id);
          toast.success("Chat deleted");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to delete chat");
        }
      },
    });
  };

  const handlePin = async (chat: Chat) => {
    const wasFavorite = isFavorite("chat", chat.id);
    try {
      await toggleFavorite("chat", chat.id);
      toast.success(wasFavorite ? "Removed from favorites" : "Pinned to sidebar");
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const handleCopy = async (chat: Chat) => {
    const url = new URL(`/chat/${chat.id}`, window.location.origin);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Chat link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleExport = async (chat: Chat) => {
    try {
      const data = await getChat(chat.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(displayChatTitle(chat))}-${chat.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Chat exported");
    } catch {
      toast.error("Failed to export chat");
    }
  };

  return (
    <main className="min-h-full bg-bg">
      {dialog}

      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <SparkleIcon size={13} className="text-fg-muted" />
          <h1 className="text-sm font-medium text-fg">Chats</h1>
          <span className="text-xs text-fg-muted tabular-nums">{filtered.length}</span>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: "/chat" })}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-fg px-2.5 text-[12px] font-medium text-bg transition-colors hover:bg-white"
        >
          <PlusIcon />
          New chat
        </button>
      </header>

      <nav className="flex items-center gap-2 border-b border-border-subtle bg-bg px-5 py-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <span className="pointer-events-none absolute left-2 text-fg-faint">
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search conversations…"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              void navigate({
                to: "/chats",
                search: next.trim() ? { q: next.trim() } : {},
                replace: true,
              });
            }}
            className="h-7 w-full bg-transparent pl-7 pr-2 text-[13px] text-fg outline-none placeholder:text-fg-faint"
          />
        </div>
        <SortMenu sort={sort} onChange={setSort} />
      </nav>

      <section className="mx-auto w-full max-w-[920px] px-5 pb-24 pt-4">
        {isLoading ? (
          <p className="px-2 py-8 text-[13px] text-fg-faint">Loading…</p>
        ) : chats.length === 0 ? (
          <ChatsEmptyState onNewChat={() => void navigate({ to: "/chat" })} />
        ) : filtered.length === 0 ? (
          <div className="px-2 py-12 text-center">
            <p className="text-[13px] text-fg">No matches for "{query}".</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                void navigate({ to: "/chats", search: {}, replace: true });
              }}
              className="mt-2 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {groups.map((group, gIdx) => (
              <div key={group.bucket} className={cn(gIdx > 0 && "mt-8")}>
                {group.bucket !== "all" ? (
                  <div className="mb-2 flex items-baseline gap-2 px-2">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
                      {bucketLabels[group.bucket]}
                    </span>
                    <span className="text-[10.5px] tabular-nums text-fg-faint">
                      {group.chats.length}
                    </span>
                  </div>
                ) : null}
                <ul className="m-0 flex list-none flex-col gap-0 p-0">
                  {group.chats.map((chat) => {
                    const pinned = isFavorite("chat", chat.id);
                    const isCreator =
                      currentUserId !== null &&
                      chat.createdById === currentUserId;
                    return (
                      <li
                        key={chat.id}
                        className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-surface/50"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void navigate({
                              to: "/chat/$chatId",
                              params: { chatId: chat.id },
                            })
                          }
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          {pinned ? (
                            <span className="shrink-0 text-warning">
                              <StarIcon size={11} filled />
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                            {displayChatTitle(chat)}
                          </span>
                          <span
                            className="shrink-0 font-mono text-[11px] tabular-nums text-fg-faint"
                            title={new Date(chat.updatedAt).toLocaleString()}
                          >
                            {formatRelative(chat.updatedAt)}
                          </span>
                        </button>
                        <RowMenu
                          chatId={chat.id}
                          pinned={pinned}
                          isCreator={isCreator}
                          onPin={() => void handlePin(chat)}
                          onExport={() => void handleExport(chat)}
                          onCopy={() => void handleCopy(chat)}
                          onDelete={() => handleDelete(chat)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {chats.length > 0 ? (
          <footer className="mt-12 flex items-center justify-center gap-3 border-t border-border-subtle/50 pt-4 text-[11px] text-fg-faint">
            <Hint label="Search">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </Hint>
            <span className="text-fg-faint/40">·</span>
            <Hint label="New chat">
              <Kbd>C</Kbd>
            </Hint>
          </footer>
        ) : null}
      </section>
    </main>
  );
}

function RowMenu({
  chatId,
  pinned,
  isCreator,
  onPin,
  onExport,
  onCopy,
  onDelete,
}: {
  chatId: string;
  pinned: boolean;
  isCreator: boolean;
  onPin: () => void;
  onExport: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {isCreator ? (
        <ChatShare
          chatId={chatId}
          trigger={
            <button
              type="button"
              aria-label="Share"
              className="h-7 shrink-0 rounded-md px-2 text-[11.5px] text-fg-faint opacity-0 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
            >
              Share
            </button>
          }
        />
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Actions"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
              open
                ? "bg-surface-2 text-fg opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <DotsIcon size={13} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="w-40 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          <MenuItem onClick={() => closeAnd(setOpen, onPin)}>
            {pinned ? "Unpin" : "Pin to sidebar"}
          </MenuItem>
          <MenuItem onClick={() => closeAnd(setOpen, onExport)}>
            Export JSON
          </MenuItem>
          <MenuItem onClick={() => closeAnd(setOpen, onCopy)}>
            Copy link
          </MenuItem>
          {isCreator ? (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <MenuItem danger onClick={() => closeAnd(setOpen, onDelete)}>
                Delete
              </MenuItem>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
        danger ? "text-danger" : "text-fg",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function closeAnd(
  setOpen: (next: boolean) => void,
  fn: () => void | Promise<void>,
) {
  setOpen(false);
  void fn();
}

function ChatsEmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="px-6 py-20 text-center">
      <p className="text-[13px] text-fg">No chats yet.</p>
      <p className="mx-auto mt-1 max-w-[360px] text-[12px] leading-relaxed text-fg-muted">
        Ask Produktive to triage issues, draft a spec, or summarize what's in
        progress.
      </p>
      <button
        type="button"
        onClick={onNewChat}
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
      >
        <PlusIcon />
        Start a chat
      </button>
    </div>
  );
}

function SortMenu({
  sort,
  onChange,
}: {
  sort: SortKey;
  onChange: (next: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = sortOptions.find((option) => option.value === sort);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
        >
          <span>{current?.label}</span>
          <ChevronDownIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-32 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
      >
        {sortOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
              option.value === sort ? "text-fg" : "text-fg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex items-center gap-0.5">{children}</span>
      <span className="text-fg-muted">{label}</span>
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="grid h-4 min-w-4 place-items-center rounded-[3px] border border-border-subtle bg-surface px-1 font-mono text-[10px] text-fg-muted">
      {children}
    </kbd>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 11l-2.4-2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function displayChatTitle(chat: Chat) {
  return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
}

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "chat"
  );
}

function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

function dateBucket(updatedAt: string): Bucket {
  const now = new Date();
  const then = new Date(updatedAt);
  const todayStart = startOfDay(now);
  const thenStart = startOfDay(then);
  const dayDiff = Math.round(
    (todayStart.getTime() - thenStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (dayDiff <= 0) return "today";
  if (dayDiff === 1) return "yesterday";
  return "earlier";
}

function formatRelative(value: string) {
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
