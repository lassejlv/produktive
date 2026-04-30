import { queryOptions, useQuery } from "@tanstack/react-query";
import { type NotificationPreferences, getMyPreferences } from "@/lib/api";

const PREFERENCES_QUERY_KEY = ["user-preferences"] as const;

export const userPreferencesQueryOptions = () =>
  queryOptions({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: getMyPreferences,
    staleTime: 60_000,
  });

export function useUserPreferences() {
  const query = useQuery(userPreferencesQueryOptions());
  const prefs = query.data ?? null;
  return {
    prefs,
    tabsEnabled: prefs?.tabsEnabled ?? true,
    isLoading: query.isPending,
  };
}

export type { NotificationPreferences };
