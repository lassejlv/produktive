import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  type TabType,
  type WorkspaceTab,
  closeAllTabs,
  closeTab,
  listTabs,
  openTab,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export const tabsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.tabs,
    queryFn: listTabs,
    staleTime: 30_000,
  });

export function useTabs() {
  const qc = useQueryClient();
  const query = useQuery(tabsQueryOptions());

  const open = useMutation({
    mutationFn: openTab,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.tabs });
      const previous = qc.getQueryData<WorkspaceTab[]>(queryKeys.tabs) ?? [];
      const existingIndex = previous.findIndex(
        (tab) =>
          tab.tabType === input.tabType && tab.targetId === input.targetId,
      );
      if (existingIndex >= 0) {
        // Re-registration: refresh title in place, do NOT reorder.
        const next = previous.slice();
        next[existingIndex] = { ...previous[existingIndex], title: input.title };
        qc.setQueryData<WorkspaceTab[]>(queryKeys.tabs, next);
      } else {
        const optimistic: WorkspaceTab = {
          id: `temp:${input.tabType}:${input.targetId}`,
          tabType: input.tabType,
          targetId: input.targetId,
          title: input.title,
          openedAt: new Date().toISOString(),
        };
        qc.setQueryData<WorkspaceTab[]>(queryKeys.tabs, [...previous, optimistic]);
      }
      return { previous };
    },
    onSuccess: (created) => {
      qc.setQueryData<WorkspaceTab[]>(queryKeys.tabs, (existing) => {
        const list = existing ?? [];
        const idx = list.findIndex(
          (tab) =>
            tab.tabType === created.tabType && tab.targetId === created.targetId,
        );
        if (idx >= 0) {
          // Replace temp/old row with the server's authoritative copy at the
          // same index — preserves the original opened_at order.
          const next = list.slice();
          next[idx] = created;
          return next;
        }
        return [...list, created];
      });
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(queryKeys.tabs, context.previous);
      }
    },
  });

  const close = useMutation({
    mutationFn: closeTab,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.tabs });
      const previous = qc.getQueryData<WorkspaceTab[]>(queryKeys.tabs);
      qc.setQueryData<WorkspaceTab[]>(
        queryKeys.tabs,
        (existing) => (existing ?? []).filter((tab) => tab.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.tabs, context.previous);
      }
    },
  });

  const closeAll = useMutation({
    mutationFn: closeAllTabs,
    onSuccess: () => {
      qc.setQueryData<WorkspaceTab[]>(queryKeys.tabs, []);
    },
  });

  return {
    tabs: query.data ?? [],
    isLoading: query.isPending,
    open: open.mutate,
    openAsync: open.mutateAsync,
    close: close.mutate,
    closeAll: closeAll.mutate,
  };
}

/**
 * Idempotently registers a tab when a detail page mounts. Re-opening with the
 * same (type, id, title) is debounced so React StrictMode double-renders or
 * rapid re-mounts don't fire the API twice.
 */
const recentRegistrations = new Map<string, number>();
const REGISTER_THROTTLE_MS = 1000;

export function useRegisterTab(input: {
  tabType: TabType;
  targetId: string;
  title: string | null | undefined;
  enabled: boolean;
}) {
  const { open } = useTabs();
  const { tabType, targetId, title, enabled } = input;

  useEffect(() => {
    if (!enabled) return;
    if (!title || !targetId) return;
    const key = `${tabType}:${targetId}:${title}`;
    const last = recentRegistrations.get(key) ?? 0;
    const now = Date.now();
    if (now - last < REGISTER_THROTTLE_MS) return;
    recentRegistrations.set(key, now);
    open({ tabType, targetId, title });
  }, [enabled, tabType, targetId, title, open]);
}
