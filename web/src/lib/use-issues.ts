import { useQueryClient } from "@tanstack/react-query";
import { type Issue } from "@/lib/api";
import {
  issuesQueryOptions,
  useIssuesQuery,
} from "@/lib/queries/issues";
import { queryKeys } from "@/lib/queries/keys";

export function useIssues() {
  const qc = useQueryClient();
  const query = useIssuesQuery();

  const addIssue = (issue: Issue) => {
    qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
      old ? [issue, ...old] : [issue],
    );
  };

  const updateIssueLocal = (id: string, patch: Partial<Issue>) => {
    qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
      old?.map((issue) =>
        issue.id === id ? { ...issue, ...patch } : issue,
      ),
    );
  };

  const removeIssueLocal = (id: string) => {
    qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
      old?.filter((issue) => issue.id !== id),
    );
  };

  const dismissError = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.issues.list() });
  };

  return {
    issues: query.data ?? [],
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    dismissError,
    addIssue,
    updateIssueLocal,
    removeIssueLocal,
  };
}

export { issuesQueryOptions };
