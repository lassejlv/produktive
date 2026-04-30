import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  type McpApiKey,
  type McpServer,
  listMcpApiKeys,
  listMcpServers,
} from "../api";
import { queryKeys } from "./keys";

export type MentionableTool = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  server: { id: string; name: string; slug: string };
};

const flattenServers = (servers: McpServer[]): MentionableTool[] => {
  const result: MentionableTool[] = [];
  for (const server of servers) {
    if (!server.enabled || server.authStatus !== "connected") continue;
    for (const tool of server.tools) {
      result.push({
        id: tool.displayName,
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        server: { id: server.id, name: server.name, slug: server.slug },
      });
    }
  }
  return result;
};

export const mcpServersQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.mcp.servers,
    queryFn: () => listMcpServers().then((r) => r.servers),
    staleTime: 5 * 60_000,
  });

export const mcpKeysQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.mcp.keys,
    queryFn: () => listMcpApiKeys().then((r) => r.keys),
    staleTime: 5 * 60_000,
  });

export const useMcpServersQuery = () => useQuery(mcpServersQueryOptions());

export const useMentionableTools = () =>
  useQuery({
    ...mcpServersQueryOptions(),
    select: flattenServers,
  });

export const useMcpKeysQuery = () => useQuery(mcpKeysQueryOptions());

export type { McpApiKey, McpServer };
