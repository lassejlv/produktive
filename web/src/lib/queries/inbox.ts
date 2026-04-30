import { queryOptions, useQuery } from "@tanstack/react-query";
import { type InboxResponse, listInbox } from "../api";
import { queryKeys } from "./keys";

export const inboxQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.inbox,
    queryFn: listInbox,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

export const useInboxQuery = () => useQuery(inboxQueryOptions());

export type { InboxResponse };
