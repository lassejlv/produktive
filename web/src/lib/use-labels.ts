import { useCallback, useEffect, useState } from "react";
import { type Label, listLabels } from "@/lib/api";

export function useLabels(includeArchived = false) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listLabels(includeArchived);
      setLabels(response.labels);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load labels",
      );
    } finally {
      setIsLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to other parts of the app creating a label.
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("produktive:label-created", handler);
    window.addEventListener("produktive:label-updated", handler);
    return () => {
      window.removeEventListener("produktive:label-created", handler);
      window.removeEventListener("produktive:label-updated", handler);
    };
  }, [refresh]);

  const addLabel = (label: Label) => {
    setLabels((current) =>
      [...current, label].sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  const updateLabelLocal = (id: string, patch: Partial<Label>) => {
    setLabels((current) =>
      current.map((label) =>
        label.id === id ? { ...label, ...patch } : label,
      ),
    );
  };

  const removeLabelLocal = (id: string) => {
    setLabels((current) => current.filter((label) => label.id !== id));
  };

  return {
    labels,
    isLoading,
    error,
    refresh,
    addLabel,
    updateLabelLocal,
    removeLabelLocal,
  };
}
