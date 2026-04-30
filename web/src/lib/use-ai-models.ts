import { useAiModelsQuery } from "@/lib/queries/ai-models";

export const useAiModels = () => {
  const query = useAiModelsQuery();
  return {
    models: query.data?.models ?? [],
    defaultId: query.data?.defaultId ?? null,
    isLoading: query.isPending,
    error: query.error,
  };
};
