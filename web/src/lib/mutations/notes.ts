import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Note,
  type NoteFolder,
  archiveNote,
  archiveNoteFolder,
  commitNote,
  createNote,
  createNoteFolder,
  restoreNoteVersion,
  updateNote,
  updateNoteFolder,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

type CreateVars = Parameters<typeof createNote>[0];
type UpdateVars = { id: string; patch: Parameters<typeof updateNote>[1] };
type CommitVars = { id: string; message?: string };
type RestoreVersionVars = { id: string; versionId: string };
type CreateFolderVars = Parameters<typeof createNoteFolder>[0];
type UpdateFolderVars = { id: string; patch: Parameters<typeof updateNoteFolder>[1] };

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVars) => createNote(input).then((r) => r.note),
    onSuccess: (note) => {
      qc.setQueriesData<Note[]>({ queryKey: queryKeys.notes.all }, (old) =>
        Array.isArray(old) ? [note, ...old.filter((n) => n.id !== note.id)] : old,
      );
      qc.setQueryData(queryKeys.notes.detail(note.id), note);
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateVars) => updateNote(id, patch).then((r) => r.note),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.notes.all });
      const prevDetail = qc.getQueryData<Note>(queryKeys.notes.detail(id));
      qc.setQueryData<Note>(queryKeys.notes.detail(id), (old) =>
        old ? ({ ...old, ...patch } as Note) : old,
      );
      return { prevDetail };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevDetail) qc.setQueryData(queryKeys.notes.detail(id), ctx.prevDetail);
    },
    onSuccess: (note) => {
      qc.setQueryData(queryKeys.notes.detail(note.id), note);
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
      qc.invalidateQueries({ queryKey: queryKeys.notes.versions(note.id) });
    },
  });
}

export function useArchiveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveNote(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.notes.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useCommitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: CommitVars) => commitNote(id, { message }).then((r) => r.version),
    onSuccess: (_version, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.versions(id) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useRestoreNoteVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionId }: RestoreVersionVars) =>
      restoreNoteVersion(id, versionId).then((r) => r.note),
    onSuccess: (note) => {
      qc.setQueryData(queryKeys.notes.detail(note.id), note);
      qc.invalidateQueries({ queryKey: queryKeys.notes.versions(note.id) });
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
    },
  });
}

export function useCreateNoteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFolderVars) => createNoteFolder(input).then((r) => r.folder),
    onSuccess: (folder) => {
      qc.setQueryData<NoteFolder[]>(queryKeys.notes.folders(), (old) =>
        Array.isArray(old) ? [...old, folder].sort((a, b) => a.name.localeCompare(b.name)) : old,
      );
      qc.invalidateQueries({ queryKey: queryKeys.notes.folders() });
    },
  });
}

export function useUpdateNoteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateFolderVars) =>
      updateNoteFolder(id, patch).then((r) => r.folder),
    onSuccess: (folder) => {
      qc.setQueryData<NoteFolder[]>(queryKeys.notes.folders(), (old) =>
        Array.isArray(old) ? old.map((item) => (item.id === folder.id ? folder : item)) : old,
      );
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
      qc.invalidateQueries({ queryKey: queryKeys.notes.folders() });
    },
  });
}

export function useArchiveNoteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveNoteFolder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notes.all });
      qc.invalidateQueries({ queryKey: queryKeys.notes.folders() });
    },
  });
}
