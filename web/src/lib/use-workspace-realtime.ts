import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiPath } from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export function useWorkspaceRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const source = new EventSource(apiPath("/api/realtime?channel=issueSystem"), {
      withCredentials: true,
    });

    const invalidateWorkspaceData = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.labels.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
    };

    source.addEventListener("refresh", invalidateWorkspaceData);
    source.addEventListener("deleted", invalidateWorkspaceData);

    return () => source.close();
  }, [enabled, queryClient]);
}
