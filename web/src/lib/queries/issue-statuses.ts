import { queryOptions, useQuery } from "@tanstack/react-query";
import { type IssueStatus, listIssueStatuses } from "../api";
import { queryKeys } from "./keys";

export const issueStatusesQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.issues.statuses(),
    queryFn: () => listIssueStatuses().then((r) => r.statuses),
    staleTime: 60_000,
  });

export const useIssueStatusesQuery = () =>
  useQuery(issueStatusesQueryOptions());

export type { IssueStatus };
