import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type ChatAccessEntry,
  grantChatAccess,
  listMembers,
  type Member,
  revokeChatAccess,
} from "@/lib/api";
import { chatAccessQueryOptions } from "@/lib/queries/chats";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";

type ChatShareProps = {
  chatId: string;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
};

export function ChatShare({ chatId, trigger, align = "end" }: ChatShareProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-72 overflow-hidden rounded-lg border border-border bg-surface p-0 shadow-xl"
      >
        {open ? <ChatShareBody chatId={chatId} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function ChatShareBody({ chatId }: { chatId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const accessQuery = useQuery(chatAccessQueryOptions(chatId));
  const membersQuery = useQuery({
    queryKey: queryKeys.members,
    queryFn: () => listMembers().then((r) => r.members),
    staleTime: 60_000,
  });

  const accessByUserId = useMemo(() => {
    const map = new Map<string, ChatAccessEntry>();
    for (const entry of accessQuery.data ?? []) map.set(entry.userId, entry);
    return map;
  }, [accessQuery.data]);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = membersQuery.data ?? [];
    if (!q) return all;
    return all.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [membersQuery.data, query]);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: [...queryKeys.chats, chatId, "access"] as const,
    });

  const grantMutation = useMutation({
    mutationFn: (userId: string) => grantChatAccess(chatId, userId),
    onSuccess: () => {
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to share"),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revokeChatAccess(chatId, userId),
    onSuccess: () => {
      void invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to remove access",
      ),
  });

  const isLoading = accessQuery.isPending || membersQuery.isPending;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border-subtle px-3 pt-2.5 pb-2">
        <p className="text-[12px] font-medium text-fg">Share chat</p>
        <p className="mt-0.5 text-[11.5px] text-fg-muted">
          Grant workspace members access to this conversation.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search members…"
        className="h-8 border-b border-border-subtle bg-transparent px-3 text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
      />
      <div className="max-h-72 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-3 text-[12px] text-fg-faint">Loading…</p>
        ) : filteredMembers.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-fg-faint">No members.</p>
        ) : (
          <ul>
            {filteredMembers.map((member) => {
              const access = accessByUserId.get(member.id);
              const hasAccess = Boolean(access);
              const isCreator = access?.isCreator ?? false;
              const pending =
                grantMutation.isPending &&
                grantMutation.variables === member.id;
              const removing =
                revokeMutation.isPending &&
                revokeMutation.variables === member.id;
              return (
                <li
                  key={member.id}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <MemberAvatar member={member} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] text-fg">
                      {member.name}
                    </span>
                    <span className="truncate text-[11px] text-fg-faint">
                      {member.email}
                    </span>
                  </div>
                  {isCreator ? (
                    <span className="text-[11px] text-fg-faint">Creator</span>
                  ) : hasAccess ? (
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => revokeMutation.mutate(member.id)}
                      className={cn(
                        "h-6 rounded-md border border-border-subtle px-2 text-[11.5px] text-fg-muted transition-colors hover:text-fg",
                        removing && "opacity-50",
                      )}
                    >
                      {removing ? "Removing…" : "Remove"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => grantMutation.mutate(member.id)}
                      className={cn(
                        "h-6 rounded-md bg-fg px-2 text-[11.5px] font-medium text-bg transition-colors hover:bg-white",
                        pending && "opacity-50",
                      )}
                    >
                      {pending ? "Adding…" : "Add"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function MemberAvatar({ member }: { member: Member }) {
  if (member.image) {
    return (
      <img
        src={member.image}
        alt=""
        className="size-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initials = (member.name || member.email)
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-[10px] font-medium text-fg-muted">
      {initials || "?"}
    </span>
  );
}
