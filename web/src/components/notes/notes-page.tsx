import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { NoteEditor } from "@/components/notes/note-editor";
import {
  useArchiveNote,
  useCommitNote,
  useCreateNote,
  useCreateNoteFolder,
  useRestoreNoteVersion,
  useUpdateNote,
} from "@/lib/mutations/notes";
import {
  type Note,
  type NoteFolder,
  useNoteDetailQuery,
  useNoteFoldersQuery,
  useNoteVersionsQuery,
  useNotesQuery,
} from "@/lib/queries/notes";
import { cn } from "@/lib/utils";

type Props = {
  noteId?: string;
};

export function NotesPage({ noteId }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("produktive.notes.sidebar") !== "hidden";
  });
  const { data: notes = [], isLoading } = useNotesQuery(search);
  const { data: folders = [] } = useNoteFoldersQuery();
  const createMutation = useCreateNote();
  const createFolderMutation = useCreateNoteFolder();
  const selectedNoteId = noteId ?? null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  const filteredNotes = selectedFolderId
    ? notes.filter((note) => note.folderId === selectedFolderId)
    : notes;

  useEffect(() => {
    window.localStorage.setItem("produktive.notes.sidebar", sidebarOpen ? "visible" : "hidden");
  }, [sidebarOpen]);

  const createNewNote = async (visibility: Note["visibility"] = "workspace") => {
    try {
      const note = await createMutation.mutateAsync({
        title: "Untitled",
        bodyMarkdown: "",
        folderId: selectedFolderId,
        visibility:
          selectedFolder?.visibility === "private" || visibility === "private"
            ? "private"
            : "workspace",
      });
      await navigate({ to: "/notes/$noteId", params: { noteId: note.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create note");
    }
  };

  const createFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    const privateFolder = window.confirm("Make this folder private?");
    try {
      const folder = await createFolderMutation.mutateAsync({
        name,
        visibility: privateFolder ? "private" : "workspace",
      });
      setSelectedFolderId(folder.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    }
  };

  return (
    <main className="flex h-[calc(100vh-49px)] min-h-0 bg-bg">
      {sidebarOpen ? (
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-border-subtle bg-sidebar/60">
          <div className="border-b border-border-subtle px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="text-[15px] font-semibold text-fg">Notes</h1>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={createFolder}
                  disabled={createFolderMutation.isPending}
                  className="rounded-[6px] border border-border-subtle px-2 py-1 text-[12px] font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
                >
                  Folder
                </button>
                <button
                  type="button"
                  onClick={() => createNewNote()}
                  disabled={createMutation.isPending}
                  className="rounded-[6px] bg-fg px-2.5 py-1 text-[12px] font-medium text-bg transition-colors hover:bg-white disabled:opacity-60"
                >
                  New
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-[6px] border border-border-subtle px-2 py-1 text-[12px] text-fg-faint transition-colors hover:text-fg"
                  aria-label="Hide notes sidebar"
                >
                  Hide
                </button>
              </div>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes"
              className="h-8 w-full rounded-[7px] border border-border-subtle bg-surface px-2.5 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border"
            />
          </div>
          <div className="border-b border-border-subtle p-2">
            <FolderButton
              active={selectedFolderId === null}
              label="All notes"
              count={notes.length}
              onClick={() => setSelectedFolderId(null)}
            />
            {folders.map((folder) => (
              <FolderButton
                key={folder.id}
                active={selectedFolderId === folder.id}
                label={folder.name}
                count={notes.filter((note) => note.folderId === folder.id).length}
                visibility={folder.visibility}
                onClick={() => setSelectedFolderId(folder.id)}
              />
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="px-2 py-3 text-[13px] text-fg-muted">Loading notes...</div>
            ) : filteredNotes.length === 0 ? (
              <div className="px-2 py-3 text-[13px] text-fg-muted">No notes here yet.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredNotes.map((note) => (
                  <NoteListItem key={note.id} note={note} selected={selectedNoteId === note.id} />
                ))}
              </div>
            )}
          </div>
        </aside>
      ) : (
        <div className="shrink-0 border-r border-border-subtle bg-sidebar/60 p-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-[7px] border border-border-subtle px-2 py-1 text-[12px] text-fg-muted transition-colors hover:text-fg"
          >
            Notes
          </button>
        </div>
      )}
      <section className="min-w-0 flex-1">
        {selectedNoteId ? (
          <NoteDetail noteId={selectedNoteId} folders={folders} />
        ) : (
          <div className="grid h-full place-items-center px-6">
            <div className="flex flex-col items-center justify-center text-center">
              <h2 className="text-sm font-medium text-fg">No note selected</h2>
              <p className="mt-1 max-w-xs text-xs text-fg-muted">
                Create a workspace note or pick one from the list.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => createNewNote()}
                  className="rounded-[7px] bg-fg px-3 py-1.5 text-[13px] font-medium text-bg transition-colors hover:bg-white"
                >
                  New note
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function FolderButton({
  active,
  label,
  count,
  visibility,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  visibility?: NoteFolder["visibility"];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-1 flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors",
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      <span className="truncate">{label}</span>
      {visibility === "private" ? (
        <span className="rounded-[4px] border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase text-fg-faint">
          Private
        </span>
      ) : null}
      <span className="ml-auto text-[11px] text-fg-faint">{count}</span>
    </button>
  );
}

function NoteListItem({ note, selected }: { note: Note; selected: boolean }) {
  return (
    <Link
      to="/notes/$noteId"
      params={{ noteId: note.id }}
      className={cn(
        "rounded-[8px] border border-transparent px-3 py-2 text-left transition-colors",
        selected
          ? "border-border-subtle bg-surface-2 text-fg"
          : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{note.title}</div>
        {note.visibility === "private" ? (
          <span className="shrink-0 rounded-[4px] border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase text-fg-faint">
            Private
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-faint">
        {note.bodySnippet ? noteSnippet(note.bodySnippet) : "Empty note"}
      </div>
    </Link>
  );
}

function NoteDetail({ noteId, folders }: { noteId: string; folders: NoteFolder[] }) {
  const navigate = useNavigate();
  const { data: note, isLoading, error } = useNoteDetailQuery(noteId);
  const { data: versions = [] } = useNoteVersionsQuery(noteId);
  const updateMutation = useUpdateNote();
  const archiveMutation = useArchiveNote();
  const commitMutation = useCommitNote();
  const restoreMutation = useRestoreNoteVersion();
  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Note["visibility"]>("workspace");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setBodyMarkdown(note.bodyMarkdown);
    setFolderId(note.folderId);
    setVisibility(note.visibility);
    setSaveState("saved");
  }, [note?.id]);

  const dirty = Boolean(
    note &&
    (title !== note.title ||
      bodyMarkdown !== note.bodyMarkdown ||
      folderId !== note.folderId ||
      visibility !== note.visibility),
  );

  useEffect(() => {
    if (!note || !dirty) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      updateMutation.mutate(
        {
          id: note.id,
          patch: { title, bodyMarkdown, folderId, visibility },
        },
        {
          onSuccess: () => setSaveState("saved"),
          onError: (mutationError) => {
            setSaveState("error");
            toast.error(
              mutationError instanceof Error ? mutationError.message : "Failed to save note",
            );
          },
        },
      );
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [bodyMarkdown, dirty, folderId, note, title, updateMutation, visibility]);

  const archive = async () => {
    if (!note) return;
    if (!window.confirm(`Archive "${note.title}"?`)) return;
    try {
      await archiveMutation.mutateAsync(note.id);
      toast.success("Note archived");
      await navigate({ to: "/notes" });
    } catch (archiveError) {
      toast.error(archiveError instanceof Error ? archiveError.message : "Failed to archive note");
    }
  };

  const commit = async () => {
    if (!note) return;
    const message = window.prompt("Commit message", "");
    try {
      await commitMutation.mutateAsync({ id: note.id, message: message?.trim() || undefined });
      toast.success("Note committed");
    } catch (commitError) {
      toast.error(commitError instanceof Error ? commitError.message : "Failed to commit note");
    }
  };

  const restore = async (versionId: string) => {
    if (!note) return;
    if (!window.confirm("Restore this version into the current note?")) return;
    try {
      const restored = await restoreMutation.mutateAsync({ id: note.id, versionId });
      setTitle(restored.title);
      setBodyMarkdown(restored.bodyMarkdown);
      setFolderId(restored.folderId);
      setVisibility(restored.visibility);
      setHistoryOpen(false);
      toast.success("Version restored");
    } catch (restoreError) {
      toast.error(restoreError instanceof Error ? restoreError.message : "Failed to restore note");
    }
  };

  const statusLabel = useMemo(() => {
    if (saveState === "error") return "Save failed";
    if (saveState === "saving" || updateMutation.isPending) return "Saving";
    return "Saved";
  }, [saveState, updateMutation.isPending]);

  if (isLoading) {
    return <div className="p-6 text-[13px] text-fg-muted">Loading note...</div>;
  }

  if (error || !note) {
    return <div className="p-6 text-[13px] text-danger">Note not found.</div>;
  }

  return (
    <article className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-6 py-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled"
          className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold text-fg outline-none placeholder:text-fg-faint"
        />
        <div className="flex items-center gap-2">
          <select
            value={folderId ?? ""}
            onChange={(event) => setFolderId(event.target.value || null)}
            className="h-7 max-w-[180px] rounded-[7px] border border-border-subtle bg-surface px-2 text-[12px] text-fg-muted outline-none transition-colors hover:text-fg"
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as Note["visibility"])}
            className="h-7 rounded-[7px] border border-border-subtle bg-surface px-2 text-[12px] text-fg-muted outline-none transition-colors hover:text-fg"
          >
            <option value="workspace">Workspace</option>
            <option value="private">Private</option>
          </select>
          <span
            className={cn("text-[12px]", saveState === "error" ? "text-danger" : "text-fg-faint")}
          >
            {statusLabel}
          </span>
          <span
            className={cn(
              "rounded-[999px] border px-2 py-0.5 text-[11px]",
              note.hasUncommittedChanges || dirty
                ? "border-amber-500/30 text-amber-300"
                : "border-border-subtle text-fg-faint",
            )}
          >
            {note.hasUncommittedChanges || dirty ? "Uncommitted changes" : "Committed"}
          </span>
          <button
            type="button"
            onClick={commit}
            disabled={commitMutation.isPending || updateMutation.isPending}
            className="rounded-[7px] border border-border-subtle px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
          >
            Commit
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              className="rounded-[7px] border border-border-subtle px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              History
            </button>
            {historyOpen ? (
              <div className="absolute right-0 top-9 z-20 max-h-[360px] w-[340px] overflow-y-auto rounded-[8px] border border-border-subtle bg-surface p-1 shadow-xl">
                {versions.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-fg-muted">No commits yet.</div>
                ) : (
                  versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center gap-3 rounded-[7px] px-3 py-2 text-[12px] hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-fg">
                          {version.commitMessage || "Untitled commit"}
                        </div>
                        <div className="mt-0.5 truncate text-fg-faint">
                          {new Date(version.createdAt).toLocaleString()} ·{" "}
                          {version.bodySha256.slice(0, 8)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => restore(version.id)}
                        disabled={restoreMutation.isPending}
                        className="shrink-0 rounded-[6px] border border-border-subtle px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
                      >
                        Restore
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={archive}
            disabled={archiveMutation.isPending}
            className="rounded-[7px] border border-border-subtle px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-60"
          >
            Archive
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <NoteEditor
          key={note.id}
          noteId={note.id}
          title={title}
          value={bodyMarkdown}
          onChange={setBodyMarkdown}
          className="h-full"
        />
      </div>
    </article>
  );
}

function noteSnippet(markdown: string) {
  const stripped = markdown
    .replace(/\[[^\]]+\]\(produktive:\/\/(?:issue|chat|user)\/[^)]+\)/g, (value) => {
      const match = /^\[([^\]]+)\]/.exec(value);
      return match?.[1] ?? "";
    })
    .replace(/[#*_`>\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || "Empty note";
}
