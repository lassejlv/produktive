import { useEffect, useState } from "react";
import { listMcpServers, type McpServer, type McpTool } from "@/lib/api";

export type MentionableTool = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  server: { id: string; name: string; slug: string };
};

type State = {
  tools: MentionableTool[];
  status: "initial" | "loading" | "ready" | "error";
  error: Error | null;
};

let cache: State = { tools: [], status: "initial", error: null };
const subscribers = new Set<() => void>();
let inflight: Promise<void> | null = null;

const notify = () => {
  for (const fn of subscribers) fn();
};

const flatten = (servers: McpServer[]): MentionableTool[] => {
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

const fetchTools = async () => {
  cache = { ...cache, status: "loading" };
  notify();
  try {
    const response = await listMcpServers();
    cache = {
      tools: flatten(response.servers),
      status: "ready",
      error: null,
    };
  } catch (error) {
    cache = {
      tools: [],
      status: "error",
      error: error instanceof Error ? error : new Error("Failed to load tools"),
    };
  }
  notify();
};

export const refreshMcpTools = (): Promise<void> => {
  if (!inflight) {
    inflight = fetchTools().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const useMcpTools = () => {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const handler = () => forceRender((tick) => tick + 1);
    subscribers.add(handler);
    if (cache.status === "initial") {
      void refreshMcpTools();
    }
    return () => {
      subscribers.delete(handler);
    };
  }, []);

  return {
    tools: cache.tools,
    isLoading:
      cache.status === "initial" || cache.status === "loading",
    error: cache.error,
    refresh: refreshMcpTools,
  };
};

export type { McpTool };
