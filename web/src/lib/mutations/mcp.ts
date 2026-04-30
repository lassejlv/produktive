import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type McpApiKey,
  createMcpApiKey,
  revokeMcpApiKey,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export function useCreateMcpApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMcpApiKey,
    onSuccess: ({ key }) => {
      qc.setQueryData<McpApiKey[]>(queryKeys.mcp.keys, (old) =>
        old ? [key, ...old] : [key],
      );
    },
  });
}

export function useRevokeMcpApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeMcpApiKey,
    onSuccess: (_data, id) => {
      qc.setQueryData<McpApiKey[]>(queryKeys.mcp.keys, (old) =>
        old?.map((item) =>
          item.id === id
            ? { ...item, revokedAt: new Date().toISOString() }
            : item,
        ),
      );
    },
  });
}
