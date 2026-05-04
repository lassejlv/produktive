import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  apiPath,
  type Chat,
  type InboxNotification,
  type InboxResponse,
  type Issue,
  type Label,
  type Project,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

type WorkspaceRealtimeEvent = {
  entity: "issue" | "project" | "label" | "notification" | "chat";
  action: "created" | "updated" | "deleted";
  entityId: string;
  payload?: unknown;
};

const parseWorkspaceEvent = (event: MessageEvent<string>) => {
  try {
    return JSON.parse(event.data) as WorkspaceRealtimeEvent;
  } catch {
    return null;
  }
};

const isIssue = (payload: unknown): payload is Issue =>
  Boolean(payload && typeof payload === "object" && "id" in payload && "title" in payload);

const isProject = (payload: unknown): payload is Project =>
  Boolean(payload && typeof payload === "object" && "id" in payload && "sortOrder" in payload);

const isLabel = (payload: unknown): payload is Label =>
  Boolean(payload && typeof payload === "object" && "id" in payload && "issueCount" in payload);

const isNotification = (payload: unknown): payload is InboxNotification =>
  Boolean(payload && typeof payload === "object" && "id" in payload && "targetType" in payload);

const isChat = (payload: unknown): payload is Chat =>
  Boolean(payload && typeof payload === "object" && "id" in payload && "updatedAt" in payload);

const upsertById = <T extends { id: string }>(
  items: T[] | undefined,
  item: T,
  compare: (a: T, b: T) => number,
) => {
  if (!items) return items;
  const exists = items.some((existing) => existing.id === item.id);
  const next = exists
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [item, ...items];
  return next.sort(compare);
};

export function useWorkspaceRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const source = new EventSource(apiPath("/api/realtime?channel=workspace"), {
      withCredentials: true,
    });

    const applyIssueEvent = (message: WorkspaceRealtimeEvent) => {
      if (message.action === "deleted") {
        queryClient.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
          old?.filter((issue) => issue.id !== message.entityId),
        );
        queryClient.removeQueries({ queryKey: queryKeys.issues.detail(message.entityId) });
        window.dispatchEvent(
          new CustomEvent("produktive:issue-deleted", {
            detail: { issueId: message.entityId },
          }),
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
        return;
      }

      if (!isIssue(message.payload)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
        return;
      }

      const issue = message.payload;
      queryClient.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
        upsertById<Issue>(
          old,
          issue,
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      queryClient.setQueryData(queryKeys.issues.detail(issue.id), issue);
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues.history(issue.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issue.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
    };

    const applyProjectEvent = (message: WorkspaceRealtimeEvent) => {
      if (message.action === "deleted") {
        for (const includeArchived of [false, true]) {
          queryClient.setQueryData<Project[]>(queryKeys.projects.list(includeArchived), (old) =>
            old?.filter((project) => project.id !== message.entityId),
          );
        }
        queryClient.removeQueries({
          queryKey: queryKeys.projects.detail(message.entityId),
          exact: true,
        });
        return;
      }

      if (!isProject(message.payload)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
        return;
      }

      const project = message.payload;
      queryClient.setQueryData<Project[]>(queryKeys.projects.list(false), (old) =>
        project.archivedAt === null
          ? upsertById<Project>(old, project, (a, b) => a.sortOrder - b.sortOrder)
          : old?.filter((item) => item.id !== project.id),
      );
      queryClient.setQueryData<Project[]>(queryKeys.projects.list(true), (old) =>
        upsertById<Project>(old, project, (a, b) => a.sortOrder - b.sortOrder),
      );
      queryClient.setQueryData(queryKeys.projects.detail(project.id), project);
    };

    const applyLabelEvent = (message: WorkspaceRealtimeEvent) => {
      if (message.action === "deleted") {
        for (const includeArchived of [false, true]) {
          queryClient.setQueryData<Label[]>(queryKeys.labels.list(includeArchived), (old) =>
            old?.filter((label) => label.id !== message.entityId),
          );
        }
        return;
      }

      if (!isLabel(message.payload)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
        return;
      }

      const label = message.payload;
      queryClient.setQueryData<Label[]>(queryKeys.labels.list(false), (old) =>
        label.archivedAt === null
          ? upsertById<Label>(old, label, (a, b) => a.name.localeCompare(b.name))
          : old?.filter((item) => item.id !== label.id),
      );
      queryClient.setQueryData<Label[]>(queryKeys.labels.list(true), (old) =>
        upsertById<Label>(old, label, (a, b) => a.name.localeCompare(b.name)),
      );
    };

    const applyNotificationEvent = (message: WorkspaceRealtimeEvent) => {
      if (!isNotification(message.payload)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
        return;
      }

      const notification = message.payload;
      queryClient.setQueryData<InboxResponse>(queryKeys.inbox, (old) => {
        if (!old) return old;
        const exists = old.notifications.some((item) => item.id === notification.id);
        const notifications = exists
          ? old.notifications.map((item) => (item.id === notification.id ? notification : item))
          : [notification, ...old.notifications];
        return {
          notifications,
          unreadCount: notifications.filter((notification) => !notification.readAt).length,
        };
      });
    };

    const applyChatEvent = (message: WorkspaceRealtimeEvent) => {
      if (message.action === "deleted") {
        queryClient.setQueryData<Chat[]>(queryKeys.chats, (old) =>
          old?.filter((chat) => chat.id !== message.entityId),
        );
        return;
      }

      if (!isChat(message.payload)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
        return;
      }

      const chat = message.payload;
      queryClient.setQueryData<Chat[]>(queryKeys.chats, (old) =>
        upsertById<Chat>(
          old,
          chat,
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      );
    };

    const handleWorkspaceEvent = (event: MessageEvent<string>) => {
      const message = parseWorkspaceEvent(event);
      if (!message) return;

      if (message.entity === "issue") applyIssueEvent(message);
      if (message.entity === "project") applyProjectEvent(message);
      if (message.entity === "label") applyLabelEvent(message);
      if (message.entity === "notification") applyNotificationEvent(message);
      if (message.entity === "chat") applyChatEvent(message);
    };

    const handleSyncRequired = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    };

    source.addEventListener("workspace", handleWorkspaceEvent);
    source.addEventListener("syncRequired", handleSyncRequired);

    return () => source.close();
  }, [enabled, queryClient]);
}
