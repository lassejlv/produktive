import { useCallback, useEffect, useState } from "react";
import { type Chat, listChats } from "@/lib/api";

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listChats();
      setChats(response.chats);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load chats",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const prependChat = useCallback((chat: Chat) => {
    setChats((current) => {
      const existing = current.findIndex((c) => c.id === chat.id);
      if (existing >= 0) {
        const next = current.slice();
        next.splice(existing, 1);
        return [chat, ...next];
      }
      return [chat, ...current];
    });
  }, []);

  const removeChat = useCallback((id: string) => {
    setChats((current) => current.filter((c) => c.id !== id));
  }, []);

  return { chats, isLoading, error, refresh, prependChat, removeChat };
}
