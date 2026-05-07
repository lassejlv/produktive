import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { NoteEditor } from "@/components/notes/note-editor";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspaceSlug } from "@/lib/use-workspace-slug";
import {
  useArchiveNote,
  useCommitNote,
  useCreateNote,
  useRestoreNoteVersion,
  useUpdateNote,
} from "@/lib/mutations/notes";
import {
  type Note,
  type NoteVersion,
  useNoteDetailQuery,
  useNoteVersionsQuery,
  useNotesQuery,
} from "@/lib/queries/notes";
import { cn } from "@/lib/utils";

type Props = {
  noteId?: string;
};

const COMMITS_PREF_KEY = "produktive.notes.commits";
const SIDEBAR_PREF_KEY = "produktive.notes.sidebar";

export function NotesPage({ noteId }: Props) {
  const navigate = useNavigate();
  const workspaceSlug = useWorkspaceSlug();
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SIDEBAR_PREF_KEY) !== "hidden";
  });
  const [commitsOpen, setCommitsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COMMITS_PREF_KEY) === "open";
  });

  const { data: notes = [], isLoading } = useNotesQuery(search);
  const createMutation = useCreateNote();

  const selectedNoteId = noteId ?? null;

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PREF_KEY, sidebarOpen ? "visible" : "hidden");
  }, [sidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem(COMMITS_PREF_KEY, commitsOpen ? "open" : "closed");
  }, [commitsOpen]);

  const createNewNote = async () => {
    try {
      const note = await createMutation.mutateAsync({
        title: "Untitled",
        bodyMarkdown: "",
        visibility: "workspace",
      });
      await navigate({
        to: "/$workspaceSlug/notes/$noteId",
        params: { workspaceSlug, noteId: note.id },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create note");
    }
  };

  return (
    <main className="flex h-[calc(100vh-49px)] min-h-0 bg-bg">
      {sidebarOpen ? (
        <NotesSidebar
          search={search}
          onSearch={setSearch}
          notes={notes}
          isLoading={isLoading}
          selectedNoteId={selectedNoteId}
          onCollapse={() => setSidebarOpen(false)}
          onNewNote={() => void createNewNote()}
          newNoteBusy={createMutation.isPending}
        />
      ) : (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Show notes sidebar"
          className="grid w-8 shrink-0 place-items-center border-r border-border-subtle/70 bg-sidebar/40 text-fg-faint transition-colors hover:text-fg"
        >
          <ChevronRightIcon />
        </button>
      )}

      <section className="flex min-w-0 flex-1">
        {selectedNoteId ? (
          <NoteWorkspace
            noteId={selectedNoteId}
            commitsOpen={commitsOpen}
            onToggleCommits={() => setCommitsOpen((open) => !open)}
          />
        ) : (
          <NotesEmptyState busy={createMutation.isPending} onNewNote={() => void createNewNote()} />
        )}
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Left sidebar                                                              */
/* -------------------------------------------------------------------------- */

function NotesSidebar({
  search,
  onSearch,
  notes,
  isLoading,
  selectedNoteId,
  onCollapse,
  onNewNote,
  newNoteBusy,
}: {
  search: string;
  onSearch: (value: string) => void;
  notes: Note[];
  isLoading: boolean;
  selectedNoteId: string | null;
  onCollapse: () => void;
  onNewNote: () => void;
  newNoteBusy: boolean;
}) {
  return (
    <aside className="relative flex w-[290px] shrink-0 flex-col border-r border-border-subtle/70 bg-sidebar/40">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h1 className="text-[14px] font-medium tracking-tight text-fg">Notes</h1>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={onNewNote} disabled={newNoteBusy} className="h-7 px-2.5">
            {newNoteBusy ? <Spinner size={11} /> : "New"}
          </Button>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide notes sidebar"
            className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface/60 hover:text-fg"
          >
            <ChevronLeftIcon />
          </button>
        </div>
      </div>

      <div className="px-4 pt-3">
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search notes"
          className="h-8 text-[13px]"
        />
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-y-auto">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
        />
        {isLoading ? (
          <div className="flex justify-center py-8 text-fg-faint">
            <Spinner size={14} />
          </div>
        ) : notes.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-fg-faint">No notes here yet.</p>
        ) : (
          <ul className="flex flex-col">
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} selected={selectedNoteId === note.id} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function NoteRow({ note, selected }: { note: Note; selected: boolean }) {
  const workspaceSlug = useWorkspaceSlug();
  return (
    <li>
      <Link
        to="/$workspaceSlug/notes/$noteId"
        params={{ workspaceSlug, noteId: note.id }}
        className={cn(
          "relative flex flex-col gap-0.5 px-4 py-2 transition-colors",
          selected ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface/50",
        )}
      >
        {selected ? (
          <span className="absolute inset-y-1 left-0 w-[2px] rounded-r-sm bg-fg" />
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          {note.visibility === "private" ? <LockIcon className="text-fg-faint" /> : null}
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", selected && "font-medium")}>
            {note.title || "Untitled"}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-fg-faint">
            {relativeTime(note.updatedAt)}
          </span>
        </div>
        <p className="truncate text-[12px] text-fg-faint">
          {note.bodySnippet ? noteSnippet(note.bodySnippet) : "Empty note"}
        </p>
      </Link>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Note workspace (editor + commits rail)                                    */
/* -------------------------------------------------------------------------- */

type SaveState = "saved" | "saving" | "error";
type Snapshot = {
  title: string;
  bodyMarkdown: string;
  visibility: Note["visibility"];
};

function NoteWorkspace({
  noteId,
  commitsOpen,
  onToggleCommits,
}: {
  noteId: string;
  commitsOpen: boolean;
  onToggleCommits: () => void;
}) {
  const navigate = useNavigate();
  const workspaceSlug = useWorkspaceSlug();
  const { data: note, isLoading, error } = useNoteDetailQuery(noteId);
  const updateMutation = useUpdateNote();
  const archiveMutation = useArchiveNote();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [visibility, setVisibility] = useState<Note["visibility"]>("workspace");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [actionsOpen, setActionsOpen] = useState(false);

  const lastSavedRef = useRef<Snapshot | null>(null);
  const savingRef = useRef(false);
  const localRef = useRef<Snapshot>({ title, bodyMarkdown, visibility });
  localRef.current = { title, bodyMarkdown, visibility };
  const updateMutationRef = useRef(updateMutation);
  updateMutationRef.current = updateMutation;

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setBodyMarkdown(note.bodyMarkdown);
    setVisibility(note.visibility);
    setSaveState("saved");
    lastSavedRef.current = {
      title: note.title,
      bodyMarkdown: note.bodyMarkdown,
      visibility: note.visibility,
    };
  }, [note?.id]);

  const dirty = Boolean(
    lastSavedRef.current &&
      (title !== lastSavedRef.current.title ||
        bodyMarkdown !== lastSavedRef.current.bodyMarkdown ||
        visibility !== lastSavedRef.current.visibility),
  );

  const isSnapshotDirty = (a: Snapshot, b: Snapshot) =>
    a.title !== b.title ||
    a.bodyMarkdown !== b.bodyMarkdown ||
    a.visibility !== b.visibility;

  const runSave = useCallback((id: string) => {
    if (savingRef.current) return;
    const baseline = lastSavedRef.current;
    if (!baseline) return;
    const snapshot = { ...localRef.current };
    if (!isSnapshotDirty(snapshot, baseline)) return;
    savingRef.current = true;
    setSaveState("saving");
    updateMutationRef.current.mutate(
      { id, patch: snapshot },
      {
        onSuccess: () => {
          lastSavedRef.current = snapshot;
          setSaveState("saved");
        },
        onError: (mutationError) => {
          setSaveState("error");
          toast.error(
            mutationError instanceof Error ? mutationError.message : "Failed to save note",
          );
        },
        onSettled: () => {
          savingRef.current = false;
          const next = lastSavedRef.current;
          if (!next) return;
          if (isSnapshotDirty(localRef.current, next)) runSave(id);
        },
      },
    );
  }, []);

  useEffect(() => {
    if (!dirty) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => runSave(noteId), 650);
    return () => window.clearTimeout(timeout);
  }, [noteId, title, bodyMarkdown, visibility, dirty, runSave]);

  const archive = () => {
    if (!note) return;
    confirm({
      title: `Archive "${note.title || "Untitled"}"?`,
      description: "Archived notes can be restored from the workspace settings.",
      confirmLabel: "Archive",
      destructive: true,
      onConfirm: async () => {
        try {
          await archiveMutation.mutateAsync(note.id);
          toast.success("Note archived");
          await navigate({ to: "/$workspaceSlug/notes", params: { workspaceSlug } });
        } catch (archiveError) {
          toast.error(
            archiveError instanceof Error ? archiveError.message : "Failed to archive note",
          );
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-fg-faint">
        <Spinner size={16} />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-[13px] text-danger">
        Note not found.
      </div>
    );
  }

  const baseline = note.committedBodyMarkdown ?? "";
  const uncommitted = note.hasUncommittedChanges || dirty;
  const diffStats = quickDiffStats(baseline, bodyMarkdown);

  const onRestoredVersion = (restored: Note) => {
    setTitle(restored.title);
    setBodyMarkdown(restored.bodyMarkdown);
    setVisibility(restored.visibility);
  };

  return (
    <>
      <article className="flex min-w-0 flex-1 flex-col">
        <header className="relative shrink-0">
          <div className="flex items-center gap-3 px-7 pb-2 pt-5">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled"
              className="min-w-0 flex-1 bg-transparent text-[22px] font-medium leading-tight tracking-[-0.01em] text-fg outline-none placeholder:text-fg-faint"
            />
            <SaveIndicator state={saveState} pending={updateMutation.isPending} />
            <CommitsToggle
              open={commitsOpen}
              uncommitted={uncommitted}
              diffStats={diffStats}
              onClick={onToggleCommits}
            />
            <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Note actions"
                  className="grid h-7 w-7 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface/60 hover:text-fg"
                >
                  <EllipsisIcon />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                <MenuItem
                  onSelect={() => {
                    setActionsOpen(false);
                    setVisibility(visibility === "private" ? "workspace" : "private");
                  }}
                >
                  {visibility === "private" ? "Make workspace" : "Make private"}
                </MenuItem>
                <MenuItem
                  tone="danger"
                  onSelect={() => {
                    setActionsOpen(false);
                    archive();
                  }}
                >
                  Archive note
                </MenuItem>
              </PopoverContent>
            </Popover>
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
        {confirmDialog}
      </article>

      {commitsOpen ? (
        <CommitsPane
          noteId={noteId}
          baseline={baseline}
          draft={bodyMarkdown}
          uncommitted={uncommitted}
          onClose={onToggleCommits}
          onRestored={onRestoredVersion}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Commits pane (right rail)                                                  */
/* -------------------------------------------------------------------------- */

function CommitsPane({
  noteId,
  baseline,
  draft,
  uncommitted,
  onClose,
  onRestored,
}: {
  noteId: string;
  baseline: string;
  draft: string;
  uncommitted: boolean;
  onClose: () => void;
  onRestored: (note: Note) => void;
}) {
  const { data: versions = [], isLoading } = useNoteVersionsQuery(noteId);
  const commitMutation = useCommitNote();
  const restoreMutation = useRestoreNoteVersion();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [message, setMessage] = useState("");
  const diff = useMemo(() => lineDiff(baseline, draft), [baseline, draft]);
  const adds = diff.filter((row) => row.type === "add").length;
  const removes = diff.filter((row) => row.type === "remove").length;
  const hasDiff = adds + removes > 0;

  const submitCommit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasDiff || commitMutation.isPending) return;
    try {
      await commitMutation.mutateAsync({ id: noteId, message: message.trim() || undefined });
      setMessage("");
      toast.success("Note committed");
    } catch (commitError) {
      toast.error(commitError instanceof Error ? commitError.message : "Failed to commit note");
    }
  };

  const restore = (version: NoteVersion) => {
    confirm({
      title: "Restore this version?",
      description: "The current note body will be replaced with this version's contents.",
      confirmLabel: "Restore",
      onConfirm: async () => {
        try {
          const restored = await restoreMutation.mutateAsync({ id: noteId, versionId: version.id });
          onRestored(restored);
          toast.success("Version restored");
        } catch (restoreError) {
          toast.error(
            restoreError instanceof Error ? restoreError.message : "Failed to restore note",
          );
        }
      },
    });
  };

  return (
    <>
      <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-border-subtle/70 bg-sidebar/40">
        <header className="flex h-10 shrink-0 items-center justify-between gap-2 px-4">
          <span className="text-[12px] font-medium text-fg">Commits</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide commits"
            title="Hide"
            className="grid size-6 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface/60 hover:text-fg"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasDiff ? (
            <section className="px-4 pb-4 pt-1">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-fg-faint">Working changes</span>
                <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">
                  <span className="text-success">+{adds}</span>{" "}
                  <span className="text-danger">−{removes}</span>
                </span>
              </div>

              <DiffView rows={diff} />

              <form onSubmit={submitCommit} className="mt-2 space-y-2">
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Commit message"
                  className="h-8 text-[12.5px]"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={commitMutation.isPending || !uncommitted}
                    className="h-7 px-3"
                  >
                    {commitMutation.isPending ? <Spinner size={11} /> : "Commit"}
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="px-4 pb-5 pt-2">
            {hasDiff ? (
              <span className="mb-2 block text-[11px] text-fg-faint">History</span>
            ) : null}
            {isLoading ? (
              <div className="flex justify-center py-6 text-fg-faint">
                <Spinner size={12} />
              </div>
            ) : versions.length === 0 ? (
              <p className="py-1 text-[12px] text-fg-faint">No commits yet.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col p-0">
                {versions.map((version, index) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    isLatest={index === 0}
                    isFirst={index === versions.length - 1}
                    onRestore={() => restore(version)}
                    busy={restoreMutation.isPending}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
      {confirmDialog}
    </>
  );
}

function VersionRow({
  version,
  isLatest,
  isFirst,
  onRestore,
  busy,
}: {
  version: NoteVersion;
  isLatest: boolean;
  isFirst: boolean;
  onRestore: () => void;
  busy: boolean;
}) {
  const sha = version.bodySha256.slice(0, 7);
  const author = version.createdBy?.name ?? "Someone";

  return (
    <li className="group relative flex gap-3 py-2.5">
      <div className="relative flex w-3 shrink-0 justify-center">
        {!isFirst ? (
          <span
            aria-hidden
            className="absolute top-3 bottom-0 w-px bg-border-subtle"
          />
        ) : null}
        <span
          aria-hidden
          className={cn(
            "relative mt-1.5 size-2 rounded-full ring-2 ring-bg",
            isLatest ? "bg-fg" : "bg-fg-muted",
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-fg">
          {version.commitMessage || "Untitled commit"}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-faint">
          <span className="font-mono tabular-nums">{sha}</span>
          <span aria-hidden>·</span>
          <span>{author}</span>
          <span aria-hidden>·</span>
          <span>{relativeTime(version.createdAt)}</span>
        </p>
      </div>

      {!isLatest ? (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className={cn(
            "h-6 shrink-0 self-start rounded-[6px] border border-border-subtle bg-surface/40 px-2 text-[11px] text-fg-muted transition-all",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            "hover:border-border hover:bg-surface/70 hover:text-fg",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {busy ? <Spinner size={10} /> : "Restore"}
        </button>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editor header bits                                                         */
/* -------------------------------------------------------------------------- */

function SaveIndicator({ state, pending }: { state: SaveState; pending: boolean }) {
  const label =
    state === "error" ? "Save failed" : state === "saving" || pending ? "Saving" : "Saved";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11.5px]",
        state === "error" ? "text-danger" : "text-fg-faint",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full transition-colors",
          state === "saving" && "bg-warning",
          state === "saved" && "bg-success",
          state === "error" && "bg-danger",
        )}
      />
      {label}
    </span>
  );
}

function CommitsToggle({
  open,
  uncommitted,
  diffStats,
  onClick,
}: {
  open: boolean;
  uncommitted: boolean;
  diffStats: { adds: number; removes: number };
  onClick: () => void;
}) {
  const showStats = !open && uncommitted && diffStats.adds + diffStats.removes > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? "Hide changes & history" : "Show changes & history"}
      aria-pressed={open}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-border-subtle bg-surface/40 px-2 text-[11.5px] text-fg-muted transition-all",
        "hover:border-border hover:bg-surface/70 hover:text-fg",
        open && "border-border bg-surface text-fg",
      )}
    >
      <BranchIcon />
      {showStats ? (
        <span className="font-mono tabular-nums">
          <span className="text-success">+{diffStats.adds}</span>{" "}
          <span className="text-danger">−{diffStats.removes}</span>
        </span>
      ) : (
        <span>{open ? "Changes" : uncommitted ? "Changes" : "History"}</span>
      )}
    </button>
  );
}

function MenuItem({
  children,
  onSelect,
  tone,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "block w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface/70",
        tone === "danger" ? "text-danger" : "text-fg",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                               */
/* -------------------------------------------------------------------------- */

function NotesEmptyState({ busy, onNewNote }: { busy: boolean; onNewNote: () => void }) {
  return (
    <div className="grid h-full flex-1 place-items-center px-6">
      <div className="flex flex-col items-center text-center">
        <NoteGlyph />
        <h2 className="mt-4 text-[14px] font-medium text-fg">No note selected</h2>
        <p className="mt-1.5 max-w-xs text-[12px] text-fg-muted">
          Pick a note from the sidebar or start a new one.
        </p>
        <Button variant="ghost" size="sm" onClick={onNewNote} disabled={busy} className="mt-4">
          {busy ? <Spinner size={11} /> : "New note"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Diff view + algorithm                                                       */
/* -------------------------------------------------------------------------- */

type DiffRow = { type: "add" | "remove" | "context"; line: string };

function DiffView({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[8px] border border-border-subtle/80 bg-surface/30 px-3 py-5 text-center text-[12px] text-fg-faint">
        No changes since last commit.
      </div>
    );
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-[8px] border border-border-subtle/80 bg-surface/30 font-mono text-[11.5px] leading-[1.55]">
      <code className="block">
        {rows.map((row, index) => (
          <div
            key={index}
            className={cn(
              "flex gap-1.5 whitespace-pre px-2.5 py-px",
              row.type === "add" && "bg-success/10 text-fg",
              row.type === "remove" && "bg-danger/10 text-fg",
              row.type === "context" && "text-fg-faint",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "w-2 shrink-0 select-none",
                row.type === "add" && "text-success",
                row.type === "remove" && "text-danger",
              )}
            >
              {row.type === "add" ? "+" : row.type === "remove" ? "−" : " "}
            </span>
            <span className="min-w-0 flex-1">{row.line || " "}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

function lineDiff(a: string, b: string): DiffRow[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const n = aLines.length;
  const m = bLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: "context", line: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "remove", line: aLines[i] });
      i++;
    } else {
      out.push({ type: "add", line: bLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "remove", line: aLines[i++] });
  while (j < m) out.push({ type: "add", line: bLines[j++] });
  return out;
}

function quickDiffStats(a: string, b: string): { adds: number; removes: number } {
  if (a === b) return { adds: 0, removes: 0 };
  const rows = lineDiff(a, b);
  let adds = 0;
  let removes = 0;
  for (const row of rows) {
    if (row.type === "add") adds++;
    else if (row.type === "remove") removes++;
  }
  return { adds, removes };
}

/* -------------------------------------------------------------------------- */
/*  Misc helpers                                                                */
/* -------------------------------------------------------------------------- */

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

function relativeTime(value: string | null) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return "now";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.round(day / 30);
  return `${mo}mo`;
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                       */
/* -------------------------------------------------------------------------- */

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EllipsisIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-fg-faint"
      aria-hidden
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}
