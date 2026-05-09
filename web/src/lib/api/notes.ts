import { internalGraphQLGet, internalGraphQLMutation, toQueryString } from "./client";

export type NoteMentionTargetType = "issue" | "chat" | "user";

export type NoteMention = {
  targetType: NoteMentionTargetType;
  targetId: string;
  label: string;
  subtitle: string | null;
};

export type Note = {
  id: string;
  folderId: string | null;
  title: string;
  bodyMarkdown: string;
  committedBodyMarkdown: string | null;
  bodySnippet: string | null;
  bodySha256: string | null;
  currentVersionId: string | null;
  hasUncommittedChanges: boolean;
  latestVersion: NoteVersion | null;
  visibility: "workspace" | "private";
  createdBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  updatedBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  mentions: NoteMention[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type NoteVersion = {
  id: string;
  noteId: string;
  bodySha256: string;
  parentVersionId: string | null;
  commitMessage: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  createdAt: string;
};

export type NoteFolder = {
  id: string;
  name: string;
  visibility: "workspace" | "private";
  createdBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type NoteMentionSearchResult = NoteMention;

export const listNotes = (search?: string) => {
  const query = toQueryString({ search: search?.trim() });
  const suffix = query ? `?${query}` : "";
  return internalGraphQLGet<{ notes: Note[] }>(`/api/notes${suffix}`);
};

export const createNote = (input?: {
  title?: string;
  bodyMarkdown?: string;
  folderId?: string | null;
  visibility?: "workspace" | "private";
}) =>
  internalGraphQLMutation<{ note: Note }>("POST", "/api/notes", input ?? {});

export const getNote = (id: string) =>
  internalGraphQLGet<{ note: Note }>(`/api/notes/${id}`);

export const updateNote = (
  id: string,
  patch: {
    title?: string;
    bodyMarkdown?: string;
    folderId?: string | null;
    visibility?: "workspace" | "private";
  },
) => internalGraphQLMutation<{ note: Note }>("PATCH", `/api/notes/${id}`, patch);

export const archiveNote = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/notes/${id}`);

export const listNoteVersions = (id: string) =>
  internalGraphQLGet<{ versions: NoteVersion[] }>(`/api/notes/${id}/versions`);

export const commitNote = (id: string, input?: { message?: string }) =>
  internalGraphQLMutation<{ version: NoteVersion }>(
    "POST",
    `/api/notes/${id}/commit`,
    input ?? {},
  );

export const restoreNoteVersion = (id: string, versionId: string) =>
  internalGraphQLMutation<{ note: Note }>(
    "POST",
    `/api/notes/${id}/versions/${versionId}/restore`,
    {},
  );

export const proposeNoteAiEdit = (
  id: string,
  input: {
    selectedText: string;
    instruction?: string;
    title?: string;
    bodyMarkdown?: string;
  },
) =>
  internalGraphQLMutation<{ replacementMarkdown: string }>(
    "POST",
    `/api/notes/${id}/ai/edit`,
    input,
  );

export const listNoteFolders = () =>
  internalGraphQLGet<{ folders: NoteFolder[] }>("/api/notes/folders");

export const createNoteFolder = (input: {
  name: string;
  visibility?: "workspace" | "private";
}) =>
  internalGraphQLMutation<{ folder: NoteFolder }>(
    "POST",
    "/api/notes/folders",
    input,
  );

export const updateNoteFolder = (
  id: string,
  patch: { name?: string; visibility?: "workspace" | "private" },
) =>
  internalGraphQLMutation<{ folder: NoteFolder }>(
    "PATCH",
    `/api/notes/folders/${id}`,
    patch,
  );

export const archiveNoteFolder = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/notes/folders/${id}`);

export const searchNoteMentions = (q: string) =>
  internalGraphQLGet<{ mentions: NoteMentionSearchResult[] }>(
    `/api/notes/mentions?${toQueryString({ q })}`,
  );
