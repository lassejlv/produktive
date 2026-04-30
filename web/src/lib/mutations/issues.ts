import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Issue,
  createIssue,
  deleteIssue,
  updateIssue,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

type UpdateVars = { id: string; patch: Parameters<typeof updateIssue>[1] };
type CreateVars = Parameters<typeof createIssue>[0];

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVars) =>
      createIssue(input).then((r) => r.issue),
    onSuccess: (issue) => {
      qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
        old ? [issue, ...old] : [issue],
      );
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateVars) =>
      updateIssue(id, patch).then((r) => r.issue),

    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.issues.all });
      const prevList = qc.getQueryData<Issue[]>(queryKeys.issues.list());
      const prevDetail = qc.getQueryData<Issue>(queryKeys.issues.detail(id));
      qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
        old?.map((i) => (i.id === id ? { ...i, ...patch } as Issue : i)),
      );
      qc.setQueryData<Issue>(queryKeys.issues.detail(id), (old) =>
        old ? ({ ...old, ...patch } as Issue) : old,
      );
      return { prevList, prevDetail };
    },

    onError: (_err, { id }, ctx) => {
      if (ctx?.prevList)
        qc.setQueryData(queryKeys.issues.list(), ctx.prevList);
      if (ctx?.prevDetail)
        qc.setQueryData(queryKeys.issues.detail(id), ctx.prevDetail);
    },

    onSuccess: (issue) => {
      qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
        old?.map((i) => (i.id === issue.id ? issue : i)),
      );
      qc.setQueryData(queryKeys.issues.detail(issue.id), issue);
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIssue(id),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.issues.list() });
      const prev = qc.getQueryData<Issue[]>(queryKeys.issues.list());
      qc.setQueryData<Issue[]>(queryKeys.issues.list(), (old) =>
        old?.filter((i) => i.id !== id),
      );
      return { prev };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.issues.list(), ctx.prev);
    },

    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.issues.detail(id) });
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.issues.list() });
    },
  });
}
