import { queryOptions, useQuery } from "@tanstack/react-query";
import { type Label, listLabels } from "../api";
import { queryKeys } from "./keys";

export const labelsQueryOptions = (includeArchived = false) =>
  queryOptions({
    queryKey: queryKeys.labels.list(includeArchived),
    queryFn: () => listLabels(includeArchived).then((r) => r.labels),
    staleTime: 60_000,
  });

export const useLabelsQuery = (includeArchived = false) =>
  useQuery(labelsQueryOptions(includeArchived));

export type { Label };
