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
    onSuccess: (created) => {
      qc.setQueryData<WorkspaceTab[]>(queryKeys.tabs, (existing) => {
        const others = (existing ?? []).filter(
          (tab) =>
            !(tab.tabType === created.tabType && tab.targetId === created.targetId),
        );
        return [...others, created];
      });
    },
  });

  const close = useMutation({
    mutationFn: closeTab,
    onMutate: (id) => {
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
