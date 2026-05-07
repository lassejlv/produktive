import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { proposeNoteAiEdit, searchNoteMentions, type NoteMentionSearchResult } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  noteId: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

type MentionState = {
  query: string;
  from: number;
  to: number;
  coords: { left: number; top: number };
};

type SlashState = {
  query: string;
  from: number;
  to: number;
  coords: { left: number; top: number };
};

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  glyph: string;
  match: string[];
  run: (
    editor: NonNullable<ReturnType<typeof useEditor>>,
    range: { from: number; to: number },
  ) => void;
};

const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1",
    label: "Heading 1",
    hint: "#",
    glyph: "H1",
    match: ["heading", "h1", "title"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "##",
    glyph: "H2",
    match: ["heading", "h2", "subtitle"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "###",
    glyph: "H3",
    match: ["heading", "h3"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    id: "ul",
    label: "Bullet list",
    hint: "-",
    glyph: "•",
    match: ["bullet", "list", "unordered"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "ol",
    label: "Numbered list",
    hint: "1.",
    glyph: "1.",
    match: ["numbered", "list", "ordered"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "Task list",
    hint: "[ ]",
    glyph: "☐",
    match: ["task", "todo", "checklist", "check"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: ">",
    glyph: "“",
    match: ["quote", "blockquote"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "```",
    glyph: "</>",
    match: ["code", "snippet", "pre"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "---",
    glyph: "—",
    match: ["divider", "horizontal", "rule", "hr", "separator"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

type SelectionState = {
  text: string;
  from: number;
  to: number;
  coords: { left: number; top: number };
};

type AiProposal = SelectionState & {
  replacementMarkdown: string;
  instruction: string;
};

export function NoteEditor({ noteId, title, value, onChange, className }: Props) {
  const onChangeRef = useRef(onChange);
  const mentionStateRef = useRef<MentionState | null>(null);
  const slashStateRef = useRef<SlashState | null>(null);
  const selectionStateRef = useRef<SelectionState | null>(null);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [mentionItems, setMentionItems] = useState<NoteMentionSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slashState, setSlashState] = useState<SlashState | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const filteredSlashItems = useMemo(() => {
    if (!slashState) return SLASH_ITEMS;
    const query = slashState.query.toLowerCase();
    if (!query) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.match.some((keyword) => keyword.startsWith(query)),
    );
  }, [slashState]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastSyncedValueRef = useRef(value);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        protocols: ["produktive"],
        HTMLAttributes: {
          class: "note-mention-link",
          rel: null,
          target: null,
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: "Write a note. Type @ to mention issues, chats, or people.",
      }),
      Markdown.configure({
        indentation: {
          style: "space",
          size: 2,
        },
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-tiptap-editor",
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getMarkdown());
      window.requestAnimationFrame(() => {
        const nextMention = readMentionState(editor);
        mentionStateRef.current = nextMention;
        setMentionState(nextMention);
        if (!nextMention) setMentionItems([]);
        const nextSlash = readSlashState(editor);
        slashStateRef.current = nextSlash;
        setSlashState(nextSlash);
        updateSelectionState(editor, selectionStateRef, setSelectionState);
      });
    },
    onSelectionUpdate: ({ editor }) => {
      window.requestAnimationFrame(() => {
        const nextMention = readMentionState(editor);
        mentionStateRef.current = nextMention;
        setMentionState(nextMention);
        if (!nextMention) setMentionItems([]);
        const nextSlash = readSlashState(editor);
        slashStateRef.current = nextSlash;
        setSlashState(nextSlash);
        updateSelectionState(editor, selectionStateRef, setSelectionState);
      });
    },
    onBlur: () => {
      window.setTimeout(() => {
        mentionStateRef.current = null;
        setMentionState(null);
        slashStateRef.current = null;
        setSlashState(null);
      }, 120);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (lastSyncedValueRef.current === value) return;
    lastSyncedValueRef.current = value;
    if (editor.getMarkdown() === value) return;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);

  useEffect(() => {
    if (!mentionState) return;
    setActiveIndex(0);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      searchNoteMentions(mentionState.query)
        .then((response) => {
          if (!controller.signal.aborted) {
            setMentionItems(uniqueMentions(response.mentions).slice(0, 7));
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setMentionItems([]);
        });
    }, 60);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [mentionState?.query]);

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashState?.query]);

  const selectSlashItem = useCallback(
    (item: SlashItem) => {
      const state = slashStateRef.current;
      if (!state || !editor) return;
      item.run(editor, { from: state.from, to: state.to });
      slashStateRef.current = null;
      setSlashState(null);
    },
    [editor],
  );

  const selectMention = useCallback(
    (mention: NoteMentionSearchResult) => {
      const state = mentionStateRef.current;
      if (!state || !editor) return;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: state.from, to: state.to }, [
          {
            type: "text",
            text: `@${mention.label}`,
            marks: [
              {
                type: "link",
                attrs: {
                  href: `produktive://${mention.targetType}/${encodeURIComponent(
                    mention.targetId,
                  )}`,
                },
              },
            ],
          },
          { type: "text", text: " " },
        ])
        .run();
      mentionStateRef.current = null;
      setMentionState(null);
      setMentionItems([]);
    },
    [editor],
  );

  const addSelectionToChat = useCallback(() => {
    const selection = selectionStateRef.current;
    if (!selection) return;
    window.dispatchEvent(
      new CustomEvent("produktive:add-to-widget-chat", {
        detail: {
          text: selection.text,
          source: title.trim() ? `note "${title.trim()}"` : "a note",
        },
      }),
    );
    toast.message("Added selection to assistant", {
      description:
        selection.text.length > 140 ? `${selection.text.slice(0, 140)}...` : selection.text,
    });
  }, [title]);

  const proposeAiEdit = useCallback(async () => {
    const selection = selectionStateRef.current;
    if (!selection || aiBusy) return;
    const instruction = window.prompt(
      "What should the AI do with this selection?",
      "Improve this text",
    );
    if (instruction === null) return;
    setAiBusy(true);
    try {
      const response = await proposeNoteAiEdit(noteId, {
        selectedText: selection.text,
        instruction,
        title,
        bodyMarkdown: value,
      });
      setAiProposal({
        ...selection,
        instruction: instruction.trim() || "Improve this text",
        replacementMarkdown: response.replacementMarkdown,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI edit failed");
    } finally {
      setAiBusy(false);
    }
  }, [aiBusy, noteId, title, value]);

  const approveAiProposal = useCallback(() => {
    if (!editor || !aiProposal) return;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: aiProposal.from, to: aiProposal.to },
        aiProposal.replacementMarkdown,
        { contentType: "markdown" },
      )
      .run();
    setAiProposal(null);
  }, [aiProposal, editor]);

  useEffect(() => {
    if (!mentionState) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        mentionStateRef.current = null;
        setMentionState(null);
        return;
      }
      if (mentionItems.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % mentionItems.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + mentionItems.length) % mentionItems.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const item = mentionItems[activeIndex];
        if (item) selectMention(item);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, mentionItems, mentionState, selectMention]);

  useEffect(() => {
    if (!slashState) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        slashStateRef.current = null;
        setSlashState(null);
        return;
      }
      if (filteredSlashItems.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashActiveIndex((current) => (current + 1) % filteredSlashItems.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashActiveIndex(
          (current) =>
            (current - 1 + filteredSlashItems.length) % filteredSlashItems.length,
        );
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const item = filteredSlashItems[slashActiveIndex];
        if (item) selectSlashItem(item);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [filteredSlashItems, slashActiveIndex, slashState, selectSlashItem]);

  return (
    <div className={cn("note-editor-shell h-full", className)}>
      <EditorContent editor={editor} className="h-full" />
      <MentionPopup
        state={mentionState}
        items={mentionItems}
        activeIndex={activeIndex}
        onSelect={selectMention}
      />
      <SlashMenu
        state={slashState}
        items={filteredSlashItems}
        activeIndex={slashActiveIndex}
        onSelect={selectSlashItem}
      />
      <SelectionToolbar
        state={aiProposal ? null : selectionState}
        busy={aiBusy}
        onAddToChat={addSelectionToChat}
        onAiEdit={() => void proposeAiEdit()}
      />
      <AiProposalCard
        proposal={aiProposal}
        onApprove={approveAiProposal}
        onReject={() => setAiProposal(null)}
      />
    </div>
  );
}

function readMentionState(editor: NonNullable<ReturnType<typeof useEditor>>): MentionState | null {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return null;
  const { from, $from } = selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /(^|\s)@([\p{L}\p{N}\s._-]{0,80})$/u.exec(textBefore);
  if (!match) return null;
  const rawQuery = match[2] ?? "";
  const coords = view.coordsAtPos(from);

  return {
    query: rawQuery.trim(),
    from: from - rawQuery.length - 1,
    to: from,
    coords: {
      left: coords.left,
      top: coords.bottom + 8,
    },
  };
}

function readSlashState(editor: NonNullable<ReturnType<typeof useEditor>>): SlashState | null {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return null;
  const { from, $from } = selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /(^|\s)\/([\p{L}\p{N}_-]{0,40})$/u.exec(textBefore);
  if (!match) return null;
  const rawQuery = match[2] ?? "";
  const coords = view.coordsAtPos(from);

  return {
    query: rawQuery.trim(),
    from: from - rawQuery.length - 1,
    to: from,
    coords: {
      left: coords.left,
      top: coords.bottom + 8,
    },
  };
}

function updateSelectionState(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  ref: MutableRefObject<SelectionState | null>,
  setState: Dispatch<SetStateAction<SelectionState | null>>,
) {
  const next = readSelectionState(editor);
  ref.current = next;
  setState(next);
}

function readSelectionState(
  editor: NonNullable<ReturnType<typeof useEditor>>,
): SelectionState | null {
  const { state, view } = editor;
  const { selection } = state;
  if (selection.empty) return null;
  const { from, to } = selection;
  const text = state.doc.textBetween(from, to, "\n\n", "\ufffc").trim();
  if (!text) return null;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  return {
    text,
    from,
    to,
    coords: {
      left: Math.max(12, Math.min(start.left, end.left)),
      top: Math.max(12, Math.min(start.top, end.top) - 48),
    },
  };
}

function SelectionToolbar({
  state,
  busy,
  onAddToChat,
  onAiEdit,
}: {
  state: SelectionState | null;
  busy: boolean;
  onAddToChat: () => void;
  onAiEdit: () => void;
}) {
  if (!state) return null;
  return createPortal(
    <div
      style={{ left: state.coords.left, top: state.coords.top }}
      className="fixed z-50 flex items-center overflow-hidden rounded-[9px] border border-border bg-[#171719]/98 text-[12px] shadow-[0_14px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onAddToChat}
        className="border-r border-border-subtle px-2.5 py-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        Add to chat
      </button>
      <button
        type="button"
        onClick={onAiEdit}
        disabled={busy}
        className="px-2.5 py-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      >
        {busy ? "Writing..." : "AI edit"}
      </button>
    </div>,
    document.body,
  );
}

function AiProposalCard({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: AiProposal | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (!proposal) return null;
  const width = 420;
  const left = Math.min(Math.max(proposal.coords.left, 12), window.innerWidth - width - 12);
  const top = Math.min(Math.max(proposal.coords.top + 44, 12), window.innerHeight - 260);
  return createPortal(
    <div
      style={{ left, top, width }}
      className="fixed z-50 overflow-hidden rounded-[12px] border border-border bg-[#171719]/98 shadow-[0_20px_60px_rgba(0,0,0,0.52)] backdrop-blur-xl"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="border-b border-border-subtle px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          AI proposal
        </div>
        <div className="mt-0.5 truncate text-[12px] text-fg-muted">{proposal.instruction}</div>
      </div>
      <div className="max-h-[170px] overflow-y-auto whitespace-pre-wrap px-3 py-2.5 text-[13px] leading-5 text-fg">
        {proposal.replacementMarkdown}
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-3 py-2">
        <button
          type="button"
          onClick={onReject}
          className="rounded-[6px] border border-border-subtle px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:text-fg"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="rounded-[6px] bg-fg px-2.5 py-1 text-[12px] font-medium text-bg transition-colors hover:bg-white"
        >
          Approve
        </button>
      </div>
    </div>,
    document.body,
  );
}

function MentionPopup({
  state,
  items,
  activeIndex,
  onSelect,
}: {
  state: MentionState | null;
  items: NoteMentionSearchResult[];
  activeIndex: number;
  onSelect: (mention: NoteMentionSearchResult) => void;
}) {
  if (!state) return null;

  const width = 280;
  const maxHeight = 280;
  const left = Math.min(Math.max(state.coords.left, 12), window.innerWidth - width - 12);
  const top =
    state.coords.top + maxHeight > window.innerHeight - 12
      ? Math.max(12, state.coords.top - maxHeight - 34)
      : state.coords.top;

  return createPortal(
    <div
      style={{ left, top, width }}
      className="fixed z-50 overflow-hidden rounded-[10px] border border-border bg-[#171719]/98 text-[12.5px] shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-fg-faint">
        Mentions
      </div>
      {items.length === 0 ? (
        <div className="px-3 pb-2.5 text-[12px] text-fg-faint">No matches</div>
      ) : (
        <div className="max-h-[252px] overflow-y-auto px-1 pb-1">
          {items.map((item, index) => (
            <button
              key={`${item.targetType}-${item.targetId}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors",
                index === activeIndex
                  ? "bg-[#242428] text-fg"
                  : "text-fg-muted hover:bg-[#202024] hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-[4px] text-[10px] font-semibold",
                  mentionTypeClass(item.targetType),
                )}
              >
                {mentionTypeShortLabel(item.targetType)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                @{item.label}
              </span>
              {item.subtitle ? (
                <span className="shrink-0 truncate text-[11px] text-fg-faint">
                  {item.subtitle}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function SlashMenu({
  state,
  items,
  activeIndex,
  onSelect,
}: {
  state: SlashState | null;
  items: SlashItem[];
  activeIndex: number;
  onSelect: (item: SlashItem) => void;
}) {
  if (!state) return null;

  const width = 260;
  const maxHeight = 320;
  const left = Math.min(Math.max(state.coords.left, 12), window.innerWidth - width - 12);
  const top =
    state.coords.top + maxHeight > window.innerHeight - 12
      ? Math.max(12, state.coords.top - maxHeight - 34)
      : state.coords.top;

  return createPortal(
    <div
      style={{ left, top, width }}
      className="fixed z-50 overflow-hidden rounded-[10px] border border-border bg-[#171719]/98 text-[12.5px] shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-fg-faint">
        Insert
      </div>
      {items.length === 0 ? (
        <div className="px-3 pb-2.5 text-[12px] text-fg-faint">No matches</div>
      ) : (
        <div className="max-h-[292px] overflow-y-auto px-1 pb-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors",
                index === activeIndex
                  ? "bg-[#242428] text-fg"
                  : "text-fg-muted hover:bg-[#202024] hover:text-fg",
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-[4px] border border-border-subtle text-[10px] font-semibold text-fg-muted">
                {item.glyph}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                {item.label}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                {item.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function uniqueMentions(items: NoteMentionSearchResult[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.targetType}:${item.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mentionTypeShortLabel(type: NoteMentionSearchResult["targetType"]) {
  if (type === "issue") return "#";
  if (type === "user") return "@";
  return "C";
}

function mentionTypeClass(type: NoteMentionSearchResult["targetType"]) {
  if (type === "issue") {
    return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  }
  if (type === "user") {
    return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  }
  return "border-violet-400/25 bg-violet-400/10 text-violet-200";
}
