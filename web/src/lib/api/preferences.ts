import {
  CloseAllTabsDocument,
  CloseTabDocument,
  OpenTabDocument,
  PreferencesDocument,
  TabsDocument,
  UpdatePreferencesDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/api/graphql/client";
import type { JsonValue } from "@/lib/json";
import { internalGraphQLGet, internalGraphQLMutation } from "./client";

export type SidebarLayoutItem = {
  id: string;
  hidden?: boolean;
};

export type SidebarLayoutPreferences = {
  items: SidebarLayoutItem[];
  favoritesCollapsed: boolean;
  chatsCollapsed: boolean;
  favoritesOrder: string[];
  chatsLimit: number;
  chatsSort: "recent" | "alphabetical";
};

export type NotificationPreferences = {
  emailPaused: boolean;
  emailAssignments: boolean;
  emailComments: boolean;
  emailProgress: boolean;
  tabsEnabled: boolean;
  sidebarLayout: SidebarLayoutPreferences | SidebarLayoutItem[] | JsonValue | null;
};

export const getMyPreferences = () =>
  graphqlRequest(PreferencesDocument, {}).then((data) =>
    unwrapGraphQLJson<NotificationPreferences>(data.preferences),
  );

export const updateMyPreferences = (patch: Partial<NotificationPreferences>) =>
  graphqlRequest(UpdatePreferencesDocument, { input: patch }).then((data) =>
    unwrapGraphQLJson<NotificationPreferences>(data.updatePreferences),
  );

export type TabType = "issue" | "project" | "chat" | "page";

export type WorkspaceTab = {
  id: string;
  tabType: TabType;
  targetId: string;
  title: string;
  openedAt: string;
};

export const listTabs = () =>
  graphqlRequest(TabsDocument, {}).then((data) =>
    unwrapGraphQLJson<WorkspaceTab[]>(data.tabs),
  );

export const openTab = (input: {
  tabType: TabType;
  targetId: string;
  title: string;
}) =>
  graphqlRequest(OpenTabDocument, { input }).then((data) =>
    unwrapGraphQLJson<WorkspaceTab>(data.openTab),
  );

export const closeTab = (id: string) =>
  graphqlRequest(CloseTabDocument, { id }).then(() => undefined as void);

export const closeAllTabs = () =>
  graphqlRequest(CloseAllTabsDocument, {}).then(() => undefined as void);

export type FavoriteTarget = "chat" | "issue" | "project";

export type Favorite =
  | {
      type: "chat";
      id: string;
      favoriteId: string;
      title: string;
      position: number;
    }
  | {
      type: "issue";
      id: string;
      favoriteId: string;
      title: string;
      status: string;
      priority: string;
      position: number;
    }
  | {
      type: "project";
      id: string;
      favoriteId: string;
      title: string;
      color: string;
      icon: string | null;
      status: string;
      position: number;
    };

export const listFavorites = () =>
  internalGraphQLGet<{ favorites: Favorite[] }>("/api/favorites");

export const addFavorite = (targetType: FavoriteTarget, targetId: string) =>
  internalGraphQLMutation<{
    favorite: {
      id: string;
      targetType: FavoriteTarget;
      targetId: string;
      position: number;
    };
  }>("POST", "/api/favorites", { targetType, targetId });

export const removeFavorite = (targetType: FavoriteTarget, targetId: string) =>
  internalGraphQLMutation<{ ok: true }>(
    "DELETE",
    `/api/favorites/by/${targetType}/${encodeURIComponent(targetId)}`,
  );

export const reorderFavorites = (favoriteIds: string[]) =>
  internalGraphQLMutation<{ ok: true }>("POST", "/api/favorites/reorder", {
    favoriteIds,
  });
