import { queryOptions, useQuery } from "@tanstack/react-query";
import { type Chat, listChats } from "../api";
import { queryKeys } from "./keys";

export const chatsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.chats,
    queryFn: () => listChats().then((r) => r.chats),
    staleTime: 60_000,
  });

export const useChatsQuery = () => useQuery(chatsQueryOptions());

export type { Chat };
