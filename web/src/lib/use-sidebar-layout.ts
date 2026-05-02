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

const KNOWN_IDS = new Set<string>(SIDEBAR_ITEM_IDS);

export const defaultSidebarLayout: SidebarLayoutItem[] = SIDEBAR_ITEM_IDS.map(
  (id) => ({ id }),
);

export function normalizeLayout(
  raw: SidebarLayoutItem[] | null | undefined,
): SidebarLayoutItem[] {
  if (!raw || raw.length === 0) return defaultSidebarLayout;
  const seen = new Set<string>();
  const ordered: SidebarLayoutItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry.id !== "string") continue;
    if (!KNOWN_IDS.has(entry.id)) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    ordered.push({
      id: entry.id,
      hidden: entry.hidden === true ? true : undefined,
    });
  }
  // Append any new (unknown to the saved layout) item ids at the end so newly
  // added nav items show up rather than disappear after a release.
  for (const id of SIDEBAR_ITEM_IDS) {
    if (!seen.has(id)) ordered.push({ id });
  }
  return ordered;
}

export function useSidebarLayout() {
  const qc = useQueryClient();
  const { prefs } = useUserPreferences();
  const layout = normalizeLayout(prefs?.sidebarLayout);

  const mutation = useMutation({
    mutationFn: (next: SidebarLayoutItem[] | null) =>
      updateMyPreferences({ sidebarLayout: next }),
    onSuccess: (data: NotificationPreferences) => {
      qc.setQueryData<NotificationPreferences>(["user-preferences"], data);
    },
  });

  return {
    layout,
    save: (next: SidebarLayoutItem[]) => mutation.mutate(next),
    reset: () => mutation.mutate(null),
    isSaving: mutation.isPending,
  };
}
