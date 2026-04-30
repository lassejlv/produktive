import { useQueryClient } from "@tanstack/react-query";
import { type Project } from "@/lib/api";
import {
  projectsQueryOptions,
  useProjectsQuery,
} from "@/lib/queries/projects";
import { queryKeys } from "@/lib/queries/keys";

export function useProjects(includeArchived = false) {
  const qc = useQueryClient();
  const query = useProjectsQuery(includeArchived);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.projects.all });
  };

  const addProject = (project: Project) => {
    qc.setQueryData<Project[]>(
      queryKeys.projects.list(includeArchived),
      (old) => (old ? [project, ...old] : [project]),
    );
  };

  const updateProjectLocal = (id: string, patch: Partial<Project>) => {
    qc.setQueryData<Project[]>(
      queryKeys.projects.list(includeArchived),
      (old) => old?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const removeProjectLocal = (id: string) => {
    qc.setQueryData<Project[]>(
      queryKeys.projects.list(includeArchived),
      (old) => old?.filter((p) => p.id !== id),
    );
  };

  return {
    projects: query.data ?? [],
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refresh,
    addProject,
    updateProjectLocal,
    removeProjectLocal,
  };
}

export { projectsQueryOptions };
