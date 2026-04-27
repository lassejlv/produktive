import { DotsIcon, PlusIcon } from "@/components/chat/icons";
import { cn } from "@/lib/utils";

export type ChatHistoryEntry = {
  id: string;
  title: string;
};

export function ChatHistoryRail({
  history,
  activeChatId,
  onNewChat,
  onSelectChat,
}: {
  history: ChatHistoryEntry[];
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
}) {
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col gap-3.5 border-r border-border-subtle bg-sidebar p-2.5 md:flex">
      <button
        type="button"
        onClick={onNewChat}
        className="mb-1.5 inline-flex h-8 w-full items-center gap-2 rounded-[7px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-[#33333a] hover:bg-surface-2"
      >
        <PlusIcon />
        <span>New chat</span>
        <span className="ml-auto rounded border border-border bg-bg px-[5px] py-px font-mono text-[10px] text-fg-faint">
          ⌘ K
        </span>
      </button>

      <div>
        <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          Recent
        </div>
        <div className="flex flex-col gap-px">
          {history.map((entry) => {
            const isActive = entry.id === activeChatId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectChat(entry.id)}
                className={cn(
                  "group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors",
                  isActive
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface hover:text-fg",
                )}
              >
                <span className="flex-1 truncate">{entry.title}</span>
                <span className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">
                  <DotsIcon />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
