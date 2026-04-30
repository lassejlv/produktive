import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Label } from "@/lib/api";
import { labelsQueryOptions, useLabelsQuery } from "@/lib/queries/labels";
import { queryKeys } from "@/lib/queries/keys";

export function useLabels(includeArchived = false) {
  const qc = useQueryClient();
  const query = useLabelsQuery(includeArchived);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.labels.all });
  };

  useEffect(() => {
    const handler = () => {
      void qc.invalidateQueries({ queryKey: queryKeys.labels.all });
    };
    window.addEventListener("produktive:label-created", handler);
    window.addEventListener("produktive:label-updated", handler);
    return () => {
      window.removeEventListener("produktive:label-created", handler);
      window.removeEventListener("produktive:label-updated", handler);
    };
  }, [qc]);

  const addLabel = (label: Label) => {
    qc.setQueryData<Label[]>(
      queryKeys.labels.list(includeArchived),
      (old) =>
        old
          ? [...old, label].sort((a, b) => a.name.localeCompare(b.name))
          : [label],
    );
  };

  const updateLabelLocal = (id: string, patch: Partial<Label>) => {
    qc.setQueryData<Label[]>(
      queryKeys.labels.list(includeArchived),
      (old) => old?.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const removeLabelLocal = (id: string) => {
    qc.setQueryData<Label[]>(
      queryKeys.labels.list(includeArchived),
      (old) => old?.filter((l) => l.id !== id),
    );
  };

  return {
    labels: query.data ?? [],
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refresh,
    addLabel,
    updateLabelLocal,
    removeLabelLocal,
  };
}

export { labelsQueryOptions };
