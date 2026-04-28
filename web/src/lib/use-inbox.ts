import { useCallback, useEffect, useState } from "react";
import {
  type InboxNotification,
  listInbox,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";

export function useInbox() {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await listInbox();
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    try {
      const response = await markNotificationRead(id);
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      /* ignore */
    }
  }, []);

  const markAll = useCallback(async () => {
    try {
      const response = await markAllNotificationsRead();
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      /* ignore */
    }
  }, []);

  return { notifications, unreadCount, isLoading, refresh, markRead, markAll };
}
