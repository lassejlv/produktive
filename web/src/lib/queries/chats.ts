import { queryOptions, useQuery } from "@tanstack/react-query";
import { type Chat, listChatAccess, listChats } from "../api";
import { queryKeys } from "./keys";

export const chatsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.chats,
    queryFn: () => listChats().then((r) => r.chats),
    staleTime: 60_000,
  });

export const chatAccessQueryOptions = (chatId: string) =>
  queryOptions({
    queryKey: [...queryKeys.chats, chatId, "access"] as const,
    queryFn: () => listChatAccess(chatId).then((r) => r.access),
    staleTime: 30_000,
  });

export const useChatsQuery = () => useQuery(chatsQueryOptions());
export const useChatAccessQuery = (chatId: string) =>
  useQuery(chatAccessQueryOptions(chatId));

export type { Chat };
