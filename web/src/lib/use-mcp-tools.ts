import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type McpTool } from "@/lib/api";
import {
  type MentionableTool,
  useMentionableTools,
} from "@/lib/queries/mcp";
import { queryKeys } from "@/lib/queries/keys";

export const useMcpTools = () => {
  const qc = useQueryClient();
  const query = useMentionableTools();

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.mcp.servers });
  }, [qc]);

  return {
    tools: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    refresh,
  };
};

export type { MentionableTool, McpTool };
