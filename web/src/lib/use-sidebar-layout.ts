import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type NotificationPreferences,
  type SidebarLayoutItem,
  updateMyPreferences,
} from "@/lib/api";
import { useUserPreferences } from "@/lib/use-user-preferences";

export const SIDEBAR_ITEM_IDS = [
  "inbox",
  "my-issues",
  "overview",
  "issues",
  "projects",
  "labels",
] as const;

export type SidebarItemId = (typeof SIDEBAR_ITEM_IDS)[number];

export type ChatsSortMode = "recent" | "alphabetical";

export const CHATS_LIMIT_OPTIONS = [3, 5, 8, 12, 20, 50] as const;

export type SidebarLayout = {
  items: SidebarLayoutItem[];
  favoritesCollapsed: boolean;
  chatsCollapsed: boolean;
  favoritesOrder: string[];
  chatsLimit: number;
  chatsSort: ChatsSortMode;
};

const KNOWN_IDS = new Set<string>(SIDEBAR_ITEM_IDS);

export const defaultSidebarItems: SidebarLayoutItem[] = SIDEBAR_ITEM_IDS.map(
  (id) => ({ id }),
);

export const defaultSidebarLayout: SidebarLayout = {
  items: defaultSidebarItems,
  favoritesCollapsed: false,
  chatsCollapsed: false,
  favoritesOrder: [],
  chatsLimit: 8,
  chatsSort: "recent",
};

function normalizeItems(raw: unknown): SidebarLayoutItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultSidebarItems;
  const seen = new Set<string>();
  const ordered: SidebarLayoutItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !KNOWN_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    const hidden = (entry as { hidden?: unknown }).hidden === true;
    ordered.push({ id, ...(hidden ? { hidden: true } : {}) });
  }
  for (const id of SIDEBAR_ITEM_IDS) {
    if (!seen.has(id)) ordered.push({ id });
  }
  return ordered;
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function normalizeLayout(raw: unknown): SidebarLayout {
  // Legacy shape: just an array of items.
  if (Array.isArray(raw)) {
    return { ...defaultSidebarLayout, items: normalizeItems(raw) };
  }
  if (!raw || typeof raw !== "object") return defaultSidebarLayout;
  const obj = raw as Record<string, unknown>;
  const rawLimit = obj.chatsLimit;
  const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(200, Math.round(rawLimit)))
    : defaultSidebarLayout.chatsLimit;
  const sort: ChatsSortMode =
    obj.chatsSort === "alphabetical" ? "alphabetical" : "recent";
  return {
    items: normalizeItems(obj.items),
    favoritesCollapsed: obj.favoritesCollapsed === true,
    chatsCollapsed: obj.chatsCollapsed === true,
    favoritesOrder: normalizeStringArray(obj.favoritesOrder),
    chatsLimit: limit,
    chatsSort: sort,
  };
}

// Order a list of objects by a saved id sequence; objects whose id is not in
// the saved order keep their original relative position at the end.
export function applyOrder<T>(
  items: T[],
  savedOrder: string[],
  getId: (item: T) => string,
): T[] {
  if (savedOrder.length === 0) return items;
  const indexById = new Map<string, number>();
  savedOrder.forEach((id, index) => indexById.set(id, index));
  const known: T[] = [];
  const unknown: T[] = [];
  for (const item of items) {
    if (indexById.has(getId(item))) known.push(item);
    else unknown.push(item);
  }
  known.sort(
    (a, b) =>
      (indexById.get(getId(a)) ?? 0) - (indexById.get(getId(b)) ?? 0),
  );
  return [...known, ...unknown];
}

export function useSidebarLayout() {
  const qc = useQueryClient();
  const { prefs } = useUserPreferences();
  const layout = normalizeLayout(prefs?.sidebarLayout);

  const mutation = useMutation({
    mutationFn: (next: SidebarLayout | null) =>
      updateMyPreferences({ sidebarLayout: next }),
    onSuccess: (data: NotificationPreferences) => {
      qc.setQueryData<NotificationPreferences>(["user-preferences"], data);
    },
  });

  const update = (patch: Partial<SidebarLayout>) => {
    mutation.mutate({ ...layout, ...patch });
  };

  return {
    layout,
    update,
    saveItems: (items: SidebarLayoutItem[]) => update({ items }),
    toggleFavoritesCollapsed: () =>
      update({ favoritesCollapsed: !layout.favoritesCollapsed }),
    toggleChatsCollapsed: () =>
      update({ chatsCollapsed: !layout.chatsCollapsed }),
    setFavoritesOrder: (favoritesOrder: string[]) =>
      update({ favoritesOrder }),
    setChatsLimit: (chatsLimit: number) => update({ chatsLimit }),
    setChatsSort: (chatsSort: ChatsSortMode) => update({ chatsSort }),
    reset: () => mutation.mutate(null),
    isSaving: mutation.isPending,
  };
}
