import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  type Note,
  type NoteFolder,
  type NoteMentionSearchResult,
  type NoteVersion,
  getNote,
  listNoteFolders,
  listNoteVersions,
  listNotes,
  searchNoteMentions,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export const notesQueryOptions = (search = "") =>
  queryOptions({
    queryKey: queryKeys.notes.list(search),
    queryFn: () => listNotes(search).then((r) => r.notes),
    staleTime: 30_000,
  });

export const noteDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.notes.detail(id),
    queryFn: () => getNote(id).then((r) => r.note),
    staleTime: 30_000,
  });

export const noteFoldersQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.notes.folders(),
    queryFn: () => listNoteFolders().then((r) => r.folders),
    staleTime: 30_000,
  });

export const noteVersionsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.notes.versions(id),
    queryFn: () => listNoteVersions(id).then((r) => r.versions),
    staleTime: 10_000,
  });

export const noteMentionQueryOptions = (q: string) =>
  queryOptions({
    queryKey: queryKeys.notes.mentions(q),
    queryFn: () => searchNoteMentions(q).then((r) => r.mentions),
    staleTime: 10_000,
  });

export const useNotesQuery = (search = "") => useQuery(notesQueryOptions(search));
export const useNoteDetailQuery = (id: string) => useQuery(noteDetailQueryOptions(id));
export const useNoteFoldersQuery = () => useQuery(noteFoldersQueryOptions());
export const useNoteVersionsQuery = (id: string) => useQuery(noteVersionsQueryOptions(id));
export const useNoteMentionQuery = (q: string) => useQuery(noteMentionQueryOptions(q));

export type { Note, NoteFolder, NoteMentionSearchResult, NoteVersion };
