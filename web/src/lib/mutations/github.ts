import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type GithubConnection,
  type GithubRepository,
  type GithubRepositoryInput,
  createGithubRepository,
  deleteGithubRepository,
  disconnectGithub,
  importGithubRepositoryIssues,
  previewGithubRepositoryImport,
  startGithubOAuth,
  updateGithubRepository,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export function useStartGithubOAuth() {
  return useMutation({ mutationFn: startGithubOAuth });
}

export function useDisconnectGithub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectGithub,
    onSuccess: () => {
      qc.setQueryData<GithubConnection>(queryKeys.github.connection, {
        connected: false,
        login: null,
        scope: null,
        connectedAt: null,
      });
    },
  });
}

export function useCreateGithubRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GithubRepositoryInput) =>
      createGithubRepository(input).then((r) => r.repository),
    onSuccess: (repository) => {
      qc.setQueryData<GithubRepository[]>(
        queryKeys.github.repositories,
        (old) => (old ? [repository, ...old] : [repository]),
      );
    },
  });
}

export function useUpdateGithubRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<GithubRepositoryInput>;
    }) => updateGithubRepository(id, patch).then((r) => r.repository),

    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.github.repositories });
      const prev = qc.getQueryData<GithubRepository[]>(
        queryKeys.github.repositories,
      );
      qc.setQueryData<GithubRepository[]>(
        queryKeys.github.repositories,
        (old) =>
          old?.map((r) =>
            r.id === id ? ({ ...r, ...patch } as GithubRepository) : r,
          ),
      );
      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.github.repositories, ctx.prev);
    },

    onSuccess: (repository) => {
      qc.setQueryData<GithubRepository[]>(
        queryKeys.github.repositories,
        (old) => old?.map((r) => (r.id === repository.id ? repository : r)),
      );
    },
  });
}

export function useDeleteGithubRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteGithubRepository,

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.github.repositories });
      const prev = qc.getQueryData<GithubRepository[]>(
        queryKeys.github.repositories,
      );
      qc.setQueryData<GithubRepository[]>(
        queryKeys.github.repositories,
        (old) => old?.filter((r) => r.id !== id),
      );
      return { prev };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.github.repositories, ctx.prev);
    },
  });
}

export function usePreviewGithubRepository() {
  return useMutation({ mutationFn: previewGithubRepositoryImport });
}

export function useImportGithubRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importGithubRepositoryIssues,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.github.repositories });
      qc.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}
