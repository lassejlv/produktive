import { useQueryClient } from "@tanstack/react-query";
import { type Issue } from "@/lib/api";
import {
  issuesInfiniteQueryOptions,
  useIssuesInfiniteQuery,
} from "@/lib/queries/issues";
import {
  type IssuesCache,
  flattenIssues,
  patchIssue,
  prependIssue,
  removeIssue,
} from "@/lib/queries/issues-cache";
import { queryKeys } from "@/lib/queries/keys";

export function useIssues() {
  const qc = useQueryClient();
  const query = useIssuesInfiniteQuery();

  const addIssue = (issue: Issue) => {
    qc.setQueryData<IssuesCache>(queryKeys.issues.list(), (old) =>
      prependIssue(old, issue),
    );
  };

  const updateIssueLocal = (id: string, patch: Partial<Issue>) => {
    qc.setQueryData<IssuesCache>(queryKeys.issues.list(), (old) =>
      patchIssue(old, id, patch),
    );
  };

  const removeIssueLocal = (id: string) => {
    qc.setQueryData<IssuesCache>(queryKeys.issues.list(), (old) =>
      removeIssue(old, id),
    );
  };

  const dismissError = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.issues.list() });
  };

  return {
    issues: flattenIssues(query.data),
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    dismissError,
    addIssue,
    updateIssueLocal,
    removeIssueLocal,
  };
}

export { issuesInfiniteQueryOptions };
