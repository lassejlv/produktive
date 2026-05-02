import { useQueryClient } from "@tanstack/react-query";
import { type IssueStatus } from "@/lib/api";
import { defaultIssueStatuses } from "@/lib/issue-constants";
import {
  issueStatusesQueryOptions,
  useIssueStatusesQuery,
} from "@/lib/queries/issue-statuses";
import { queryKeys } from "@/lib/queries/keys";

export function useIssueStatuses() {
  const qc = useQueryClient();
  const query = useIssueStatusesQuery();
  const statuses = query.data?.length ? query.data : defaultIssueStatuses;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.issues.statuses() });
  };

  const setStatuses = (next: IssueStatus[]) => {
    qc.setQueryData(queryKeys.issues.statuses(), next);
  };

  return {
    statuses,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refresh,
    setStatuses,
  };
}

export { issueStatusesQueryOptions };
