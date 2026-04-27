import { useEffect, useState } from "react";
import {
  type Issue,
  deleteIssue,
  listIssues,
  updateIssue,
} from "@/lib/api";

export function useIssues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listIssues();
        if (isMounted) setIssues(response.issues);
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load issues",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const addIssue = (issue: Issue) => {
    setIssues((current) => [issue, ...current]);
  };

  const changeStatus = async (issue: Issue, nextStatus: string) => {
    const previous = issues;
    setIssues((current) =>
      current.map((c) => (c.id === issue.id ? { ...c, status: nextStatus } : c)),
    );

    try {
      await updateIssue(issue.id, { status: nextStatus });
    } catch (updateError) {
      setIssues(previous);
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update issue",
      );
    }
  };

  const changePriority = async (issue: Issue, nextPriority: string) => {
    const previous = issues;
    setIssues((current) =>
      current.map((c) => (c.id === issue.id ? { ...c, priority: nextPriority } : c)),
    );

    try {
      await updateIssue(issue.id, { priority: nextPriority });
    } catch (updateError) {
      setIssues(previous);
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update issue",
      );
    }
  };

  const remove = async (issue: Issue) => {
    const previous = issues;
    setIssues((current) => current.filter((c) => c.id !== issue.id));

    try {
      await deleteIssue(issue.id);
    } catch (deleteError) {
      setIssues(previous);
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete issue",
      );
    }
  };

  const dismissError = () => setError(null);

  return {
    issues,
    isLoading,
    error,
    dismissError,
    addIssue,
    changeStatus,
    changePriority,
    remove,
  };
}
