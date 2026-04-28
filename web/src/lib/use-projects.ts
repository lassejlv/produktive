import { useCallback, useEffect, useState } from "react";
import { type Project, listProjects } from "@/lib/api";

export function useProjects(includeArchived = false) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listProjects(includeArchived);
      setProjects(response.projects);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load projects",
      );
    } finally {
      setIsLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addProject = (project: Project) => {
    setProjects((current) => [project, ...current]);
  };

  const updateProjectLocal = (id: string, patch: Partial<Project>) => {
    setProjects((current) =>
      current.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const removeProjectLocal = (id: string) => {
    setProjects((current) => current.filter((p) => p.id !== id));
  };

  return {
    projects,
    isLoading,
    error,
    refresh,
    addProject,
    updateProjectLocal,
    removeProjectLocal,
  };
}
