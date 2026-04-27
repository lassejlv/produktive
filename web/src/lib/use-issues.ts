import { useEffect, useState } from "react";
import { type Issue, listIssues } from "@/lib/api";

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

  const dismissError = () => setError(null);

  return {
    issues,
    isLoading,
    error,
    dismissError,
    addIssue,
  };
}
