import type { AiModel } from "@/lib/api";
import { useAiModelsQuery } from "@/lib/queries/ai-models";

export function selectAvailableModel(
  models: AiModel[],
  defaultId: string | null,
  selectedId: string | null,
) {
  const current = selectedId ? models.find((entry) => entry.id === selectedId) : null;
  if (current?.isAvailable) return selectedId;
  return (
    models.find((entry) => entry.id === defaultId && entry.isAvailable)?.id ??
    models.find((entry) => entry.isAvailable)?.id ??
    null
  );
}

export const useAiModels = () => {
  const query = useAiModelsQuery();
  return {
    models: query.data?.models ?? [],
    defaultId: query.data?.defaultId ?? null,
    isLoading: query.isPending,
    error: query.error,
  };
};
