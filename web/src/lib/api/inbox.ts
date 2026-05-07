import {
  InboxDocument,
  MarkAllNotificationsReadDocument,
  MarkNotificationReadDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/graphql/client";

export type InboxNotification = {
  id: string;
  kind: string;
  targetType: string;
  targetId: string;
  title: string;
  snippet: string | null;
  createdAt: string;
  readAt: string | null;
  actor: {
    id: string;
    name: string;
    image: string | null;
  } | null;
};

export type InboxResponse = {
  notifications: InboxNotification[];
  unreadCount: number;
};

export const listInbox = () =>
  graphqlRequest(InboxDocument, {}).then((data) =>
    unwrapGraphQLJson<InboxResponse>(data.inbox),
  );

export const markNotificationRead = (id: string) =>
  graphqlRequest(MarkNotificationReadDocument, { id }).then((data) =>
    unwrapGraphQLJson<InboxResponse>(data.markNotificationRead),
  );

export const markAllNotificationsRead = () =>
  graphqlRequest(MarkAllNotificationsReadDocument, {}).then((data) =>
    unwrapGraphQLJson<InboxResponse>(data.markAllNotificationsRead),
  );
