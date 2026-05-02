import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Project,
  type UpdateProjectInput,
  createProject,
  deleteProject,
  updateProject,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createProject>[0]) =>
      createProject(input).then((r) => r.project),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) =>
      updateProject(id, patch).then((r) => r.project),

    onMutate: async ({ id, patch }) => {
      const projectListKey = ["projects", "list"] as const;
      await qc.cancelQueries({ queryKey: projectListKey });
      const prevLists = qc.getQueriesData<Project[]>({
        queryKey: projectListKey,
      });
      const { archived, ...rest } = patch;
      const projectPatch: Partial<Project> = { ...rest };
      if (archived !== undefined) {
        projectPatch.archivedAt = archived ? new Date().toISOString() : null;
      }
      for (const [key, list] of prevLists) {
        if (!list) continue;
        qc.setQueryData<Project[]>(
          key,
          list.map((p) => (p.id === id ? { ...p, ...projectPatch } : p)),
        );
      }
      return { prevLists };
    },

    onError: (_err, _vars, ctx) => {
      if (!ctx?.prevLists) return;
      for (const [key, list] of ctx.prevLists) {
        qc.setQueryData(key, list);
      }
    },

    onSuccess: (project) => {
      qc.setQueryData(queryKeys.projects.detail(project.id), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
