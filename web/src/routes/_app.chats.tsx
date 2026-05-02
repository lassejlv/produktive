import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SparkleIcon } from "@/components/chat/icons";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
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

function ChatsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { chats, isLoading, removeChat } = useChats();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { confirm, dialog } = useConfirmDialog();
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState(search.q ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? chats.filter((chat) =>
          (chat.title || "").toLowerCase().includes(q),
        )
      : chats;
    const copy = [...pool];
    if (sort === "alphabetical") {
      copy.sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", undefined, {
          sensitivity: "base",
        }),
      );
    } else if (sort === "oldest") {
      copy.sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      );
    } else {
      copy.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return copy;
  }, [chats, sort, query]);

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
          <span className="text-fg-muted">
            <SparkleIcon size={12} />
          </span>
          <h1 className="text-sm font-medium text-fg">Chats</h1>
          <span className="text-xs text-fg-muted tabular-nums">{filtered.length}</span>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: "/chat" })}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-fg px-2.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
        >
          New chat
        </button>
      </header>

      <nav className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-bg px-5 py-2">
        <input
          type="search"
          placeholder="Search chats…"
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
          className="h-7 min-w-0 flex-1 rounded-md border border-border-subtle bg-transparent px-2 text-[12.5px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border"
        />
        <div className="flex items-center gap-1">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-2.5 text-xs transition-colors",
                sort === option.value
                  ? "bg-surface text-fg"
                  : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="mx-auto w-full max-w-[760px] px-5 py-6">
        {isLoading ? (
          <p className="text-[13px] text-fg-faint">Loading…</p>
        ) : chats.length === 0 ? (
          <ChatsEmptyState onNewChat={() => void navigate({ to: "/chat" })} />
        ) : filtered.length === 0 ? (
          <p className="text-[13px] text-fg-faint">No chats match "{query}".</p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-border-subtle">
            {filtered.map((chat, index) => {
              const pinned = isFavorite("chat", chat.id);
              return (
                <li
                  key={chat.id}
                  className={cn(
                    "group flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors",
                    index !== filtered.length - 1 && "border-b border-border-subtle",
                  )}
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
                    <span className="text-fg-faint">
                      <SparkleIcon size={11} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {displayChatTitle(chat)}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-faint">
                      {formatRelative(chat.updatedAt)}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <RowAction
                      label={pinned ? "Unpin" : "Pin"}
                      onClick={() => void handlePin(chat)}
                    />
                    <RowAction label="Export" onClick={() => void handleExport(chat)} />
                    <RowAction label="Copy" onClick={() => void handleCopy(chat)} />
                    <RowAction
                      label="Delete"
                      tone="danger"
                      onClick={() => handleDelete(chat)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function RowAction({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors",
        tone === "danger"
          ? "hover:bg-danger/10 hover:text-danger"
          : "hover:bg-surface hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

function ChatsEmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-surface/60 text-fg-muted">
        <SparkleIcon size={20} />
      </div>
      <h2 className="text-[15px] font-medium text-fg">No chats yet</h2>
      <p className="mt-1 max-w-[360px] text-[13px] text-fg-muted">
        Start a chat with Produktive — ask questions, draft issues, or get a quick summary.
      </p>
      <button
        type="button"
        onClick={onNewChat}
        className="mt-5 rounded-md bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
      >
        New chat
      </button>
    </div>
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
  return new Date(value).toLocaleDateString();
}
