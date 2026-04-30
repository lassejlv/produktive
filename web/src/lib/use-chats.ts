import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type Chat } from "@/lib/api";
import { useChatsQuery } from "@/lib/queries/chats";
import { queryKeys } from "@/lib/queries/keys";

export function useChats() {
  const qc = useQueryClient();
  const query = useChatsQuery();

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.chats });
  }, [qc]);

  const prependChat = useCallback(
    (chat: Chat) => {
      qc.setQueryData<Chat[]>(queryKeys.chats, (old) => {
        if (!old) return [chat];
        const existingIdx = old.findIndex((c) => c.id === chat.id);
        if (existingIdx >= 0) {
          const next = old.slice();
          next.splice(existingIdx, 1);
          return [chat, ...next];
        }
        return [chat, ...old];
      });
    },
    [qc],
  );

  const removeChat = useCallback(
    (id: string) => {
      qc.setQueryData<Chat[]>(queryKeys.chats, (old) =>
        old?.filter((c) => c.id !== id),
      );
    },
    [qc],
  );

  return {
    chats: query.data ?? [],
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refresh,
    prependChat,
    removeChat,
  };
}
