import { useEffect, useState } from "react";
import { listAiModels, type AiModel } from "@/lib/api";

type State = {
  models: AiModel[];
  defaultId: string | null;
  status: "initial" | "loading" | "ready" | "error";
  error: Error | null;
};

let cache: State = {
  models: [],
  defaultId: null,
  status: "initial",
  error: null,
};
const subscribers = new Set<() => void>();
let inflight: Promise<void> | null = null;

const notify = () => {
  for (const fn of subscribers) fn();
};

const fetchModels = async () => {
  cache = { ...cache, status: "loading" };
  notify();
  try {
    const response = await listAiModels();
    cache = {
      models: response.models,
      defaultId: response.defaultId,
      status: "ready",
      error: null,
    };
  } catch (error) {
    cache = {
      ...cache,
      status: "error",
      error: error instanceof Error ? error : new Error("Failed to load models"),
    };
  }
  notify();
};

export const refreshAiModels = (): Promise<void> => {
  if (!inflight) {
    inflight = fetchModels().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const useAiModels = () => {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const handler = () => forceRender((tick) => tick + 1);
    subscribers.add(handler);
    if (cache.status === "initial") {
      void refreshAiModels();
    }
    return () => {
      subscribers.delete(handler);
    };
  }, []);

  return {
    models: cache.models,
    defaultId: cache.defaultId,
    isLoading: cache.status === "initial" || cache.status === "loading",
    error: cache.error,
  };
};
