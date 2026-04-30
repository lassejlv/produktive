import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import { useInboxQuery, type InboxResponse } from "@/lib/queries/inbox";
import { queryKeys } from "@/lib/queries/keys";

export function useInbox() {
  const qc = useQueryClient();
  const query = useInboxQuery();
  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.inbox });
  }, [qc]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        const response = await markNotificationRead(id);
        qc.setQueryData<InboxResponse>(queryKeys.inbox, response);
      } catch {
        /* ignore */
      }
    },
    [qc],
  );

  const markAll = useCallback(async () => {
    try {
      const response = await markAllNotificationsRead();
      qc.setQueryData<InboxResponse>(queryKeys.inbox, response);
    } catch {
      /* ignore */
    }
  }, [qc]);

  return {
    notifications,
    unreadCount,
    isLoading: query.isPending,
    refresh,
    markRead,
    markAll,
  };
}
