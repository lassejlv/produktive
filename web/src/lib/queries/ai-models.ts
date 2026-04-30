import { queryOptions, useQuery } from "@tanstack/react-query";
import { type AiModel, type AiModelsResponse, listAiModels } from "../api";
import { queryKeys } from "./keys";

export const aiModelsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.ai.models,
    queryFn: listAiModels,
    staleTime: 5 * 60_000,
  });

export const useAiModelsQuery = () => useQuery(aiModelsQueryOptions());

export type { AiModel, AiModelsResponse };
