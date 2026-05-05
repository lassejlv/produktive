import { useEffect, useMemo, useRef, useState } from "react";
import { AttachIcon, AtIcon, ChangesIcon, SendIcon, StopIcon } from "@/components/chat/icons";
import {
  MentionPopup,
  type MentionItem,
  prettyToolName,
} from "@/components/chat/tool-mention-popup";
import { StatusIcon } from "@/components/issue/status-icon";
import { SparkleIcon } from "@/components/chat/icons";
import {
  type ChatAttachmentDraft,
  type ReferencedChat,
  type ReferencedIssue,
  type ReferencedNote,
  formatBytes,
  formatChatReferences,
  formatIssueReferences,
  formatNoteReferences,
  formatToolReferences,
  prepareChatAttachments,
} from "@/lib/chat-attachments";
import { useNotesQuery } from "@/lib/queries/notes";
import { getCaretCoords } from "@/lib/textarea-caret";
import { useChats } from "@/lib/use-chats";
import { useIssues } from "@/lib/use-issues";
import { useMcpTools, type MentionableTool } from "@/lib/use-mcp-tools";
import { cn } from "@/lib/utils";

export type PendingQuestion = {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
};

export function ChatComposer({
  busy,
  onSend,
  onStop,
  onOpenChanges,
  changesCount = 0,
  changesOpen = false,
  pendingQuestion,
  draftInsertion,
}: {
  busy: boolean;
  onSend: (value: string, attachments: ChatAttachmentDraft[]) => void;
  onStop: () => void;
  onOpenChanges?: () => void;
  changesCount?: number;
  changesOpen?: boolean;
  pendingQuestion?: PendingQuestion | null;
  draftInsertion?: { id: number; text: string } | null;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ReferencedIssue[]>([]);
  const [mentionedTools, setMentionedTools] = useState<MentionableTool[]>([]);
  const [mentionedChats, setMentionedChats] = useState<ReferencedChat[]>([]);
  const [mentionedNotes, setMentionedNotes] = useState<ReferencedNote[]>([]);
  const [mentionState, setMentionState] = useState<{
    anchor: number;
    query: string;
    coords: { left: number; top: number };
  } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { tools: availableTools } = useMcpTools();
  const { issues: availableIssues } = useIssues();
  const { chats: availableChats } = useChats();
  const { data: availableNotes = [] } = useNotesQuery("");

  useEffect(() => {
    if (!draftInsertion?.text) return;
    setValue((current) => {
      const trimmed = current.trimEnd();
      return `${trimmed}${trimmed ? "\n\n" : ""}${draftInsertion.text}`;
    });
    requestAnimationFrame(() => {
      const textarea = taRef.current;
      if (!textarea) return;
      textarea.focus();
      autoresize(textarea);
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }, [draftInsertion?.id, draftInsertion?.text]);

  const mentionItems = useMemo<MentionItem[]>(() => {
    const issueItems: MentionItem[] = availableIssues.map((issue) => ({
      kind: "issue",
      id: `issue:${issue.id}`,
      issue: {
        id: issue.id,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
      },
    }));
    const chatItems: MentionItem[] = availableChats.map((chat) => ({
      kind: "chat",
      id: `chat:${chat.id}`,
      chat,
    }));
    const noteItems: MentionItem[] = availableNotes.map((note) => ({
      kind: "note",
      id: `note:${note.id}`,
      note,
    }));
    const toolItems: MentionItem[] = availableTools.map((tool) => ({
      kind: "tool",
      id: `tool:${tool.id}`,
      tool,
    }));
    return [...issueItems, ...noteItems, ...chatItems, ...toolItems];
  }, [availableIssues, availableNotes, availableChats, availableTools]);

  const autoresize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const detectMention = (textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart ?? textarea.value.length;
    const before = textarea.value.slice(0, caret);
    const atIndex = before.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionState(null);
      return;
    }
    const charBefore = atIndex === 0 ? "" : before[atIndex - 1];
    const atBoundary = atIndex === 0 || /\s/.test(charBefore);
    if (!atBoundary) {
      setMentionState(null);
      return;
    }
    const query = before.slice(atIndex + 1);
    if (!/^[\w-]*$/.test(query)) {
      setMentionState(null);
      return;
    }
    setMentionState({
      anchor: atIndex,
      query,
      coords: getCaretCoords(textarea),
    });
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    autoresize(event.target);
    detectMention(event.target);
  };

  const openMentionFromButton = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    const caret = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, caret);
    const after = ta.value.slice(caret);
    const needsSpace = before.length > 0 && !/\s/.test(before[before.length - 1] ?? "");
    const insertion = `${needsSpace ? " " : ""}@`;
    const next = before + insertion + after;
    setValue(next);
    autoresize(ta);
    const newCaret = caret + insertion.length;
    requestAnimationFrame(() => {
      ta.setSelectionRange(newCaret, newCaret);
      detectMention(ta);
    });
  };

  const addMentionedTool = (tool: MentionableTool) => {
    setMentionedTools((current) =>
      current.find((existing) => existing.id === tool.id) ? current : [...current, tool],
    );
  };

  const addMentionedIssue = (issue: ReferencedIssue) => {
    setIssues((current) =>
      current.find((existing) => existing.id === issue.id) ? current : [...current, issue],
    );
  };

  const addMentionedChat = (chat: ReferencedChat) => {
    setMentionedChats((current) =>
      current.find((existing) => existing.id === chat.id) ? current : [...current, chat],
    );
  };

  const addMentionedNote = (note: ReferencedNote) => {
    setMentionedNotes((current) =>
      current.find((existing) => existing.id === note.id) ? current : [...current, note],
    );
  };

  const onSelectMention = (item: MentionItem) => {
    const ta = taRef.current;
    if (!ta || !mentionState) return;
    const caret = ta.selectionStart ?? ta.value.length;
    const nextValue = ta.value.slice(0, mentionState.anchor) + ta.value.slice(caret);
    setValue(nextValue);
    if (item.kind === "tool") {
      addMentionedTool(item.tool);
    } else if (item.kind === "issue") {
      addMentionedIssue(item.issue);
    } else if (item.kind === "chat") {
      addMentionedChat({
        id: item.chat.id,
        title: item.chat.title || "Untitled chat",
      });
    } else {
      addMentionedNote({
        id: item.note.id,
        title: item.note.title,
        visibility: item.note.visibility,
      });
    }
    const restoreAt = mentionState.anchor;
    setMentionState(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(restoreAt, restoreAt);
      autoresize(ta);
    });
  };

  const removeTool = (id: string) => {
    setMentionedTools((current) => current.filter((tool) => tool.id !== id));
  };

  const removeMentionedChat = (id: string) => {
    setMentionedChats((current) => current.filter((chat) => chat.id !== id));
  };

  const removeMentionedNote = (id: string) => {
    setMentionedNotes((current) => current.filter((note) => note.id !== id));
  };

  const trySend = () => {
    const trimmed = value.trim();
    if (
      (!trimmed &&
        attachments.length === 0 &&
        issues.length === 0 &&
        mentionedTools.length === 0 &&
        mentionedChats.length === 0 &&
        mentionedNotes.length === 0) ||
      busy
    ) {
      return;
    }
    const fallback = attachments.length > 0 ? "Review the attached files." : "";
    const baseText = trimmed || fallback;
    const outgoing = `${baseText}${formatIssueReferences(issues)}${formatChatReferences(
      mentionedChats,
    )}${formatNoteReferences(mentionedNotes)}${formatToolReferences(mentionedTools)}`.trim();
    onSend(outgoing, attachments);
    setValue("");
    setAttachments([]);
    setAttachmentError(null);
    setIssues([]);
    setMentionedTools([]);
    setMentionedChats([]);
    setMentionedNotes([]);
    setMentionState(null);
    requestAnimationFrame(() => autoresize(taRef.current));
  };

  const placeholder = pendingQuestion
    ? "Answer the question above…"
    : "Ask Produktive anything — type @ to add context";

  const removeIssue = (id: string) => {
    setIssues((current) => current.filter((issue) => issue.id !== id));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const result = prepareChatAttachments(files, attachments.length);
    if (result.attachments.length > 0) {
      setAttachments((current) => [...current, ...result.attachments]);
    }
    setAttachmentError(result.errors[0] ?? null);

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((file) => file.id !== id));
    setAttachmentError(null);
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState !== null) {
      // Mention popup is open; let it own keyboard handling.
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySend();
    }
  };

  const canSend =
    (value.trim().length > 0 ||
      attachments.length > 0 ||
      issues.length > 0 ||
      mentionedTools.length > 0 ||
      mentionedChats.length > 0 ||
      mentionedNotes.length > 0) &&
    !busy;

  return (
    <div className="relative z-10 px-6 pb-3 pt-2">
      <div
        className={cn(
          "mx-auto w-full max-w-[760px] overflow-hidden rounded-[10px] border bg-surface/80 transition-colors focus-within:bg-surface-2",
          pendingQuestion
            ? "border-accent/40 focus-within:border-accent/60"
            : "border-border-subtle focus-within:border-border",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        {pendingQuestion ? (
          <div className="border-b border-border-subtle bg-surface/40 px-3.5 py-3">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-faint">
              <span aria-hidden="true">?</span>
              Question
            </div>
            <p className="m-0 text-[13.5px] leading-snug text-fg">{pendingQuestion.question}</p>
            {pendingQuestion.options.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {pendingQuestion.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => pendingQuestion.onAnswer(option)}
                    disabled={busy}
                    className="inline-flex h-7 items-center rounded-[5px] border border-border-subtle bg-surface px-2 text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {attachments.length > 0 ||
        issues.length > 0 ||
        mentionedTools.length > 0 ||
        mentionedChats.length > 0 ||
        mentionedNotes.length > 0 ? (
          <div className="border-b border-border-subtle px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {mentionedChats.map((chat) => (
                <div
                  key={chat.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted"
                >
                  <span className="text-fg-faint">
                    <SparkleIcon size={11} />
                  </span>
                  <span className="max-w-[180px] truncate text-fg">{chat.title}</span>
                  <button
                    type="button"
                    className="text-fg-faint transition-colors hover:text-fg"
                    onClick={() => removeMentionedChat(chat.id)}
                    aria-label={`Remove ${chat.title}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {mentionedNotes.map((note) => (
                <div
                  key={note.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted"
                >
                  <span className="font-mono text-[10px] text-fg-faint">N</span>
                  <span className="max-w-[180px] truncate text-fg">{note.title}</span>
                  <span className="text-fg-faint">· {note.visibility}</span>
                  <button
                    type="button"
                    className="text-fg-faint transition-colors hover:text-fg"
                    onClick={() => removeMentionedNote(note.id)}
                    aria-label={`Remove ${note.title}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {mentionedTools.map((tool) => (
                <div
                  key={tool.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted"
                >
                  <span className="font-mono text-[10px] text-fg-faint">@</span>
                  <span className="max-w-[180px] truncate font-mono text-fg">
                    {prettyToolName(tool)}
                  </span>
                  <span className="text-fg-faint">· {tool.server.name}</span>
                  <button
                    type="button"
                    className="text-fg-faint transition-colors hover:text-fg"
                    onClick={() => removeTool(tool.id)}
                    aria-label={`Remove ${tool.displayName}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted"
                >
                  <StatusIcon status={issue.status} />
                  <span className="max-w-[220px] truncate text-fg">{issue.title}</span>
                  <button
                    type="button"
                    className="text-fg-faint transition-colors hover:text-fg"
                    onClick={() => removeIssue(issue.id)}
                    aria-label={`Remove ${issue.title}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 font-mono text-[11px] text-fg-muted"
                >
                  <span className="max-w-[220px] truncate text-fg">{file.file.name}</span>
                  <span>{formatBytes(file.file.size)}</span>
                  <button
                    type="button"
                    className="text-fg-faint transition-colors hover:text-fg"
                    onClick={() => removeAttachment(file.id)}
                    aria-label={`Remove ${file.file.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKey}
          onClick={(event) => detectMention(event.currentTarget)}
          onKeyUp={(event) => {
            const navKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
            if (navKeys.includes(event.key)) {
              detectMention(event.currentTarget);
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="block min-h-[46px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3.5 text-[14px] leading-[1.55] text-fg outline-none placeholder:text-fg-muted"
          style={{ maxHeight: 240 }}
        />
        <MentionPopup
          open={mentionState !== null}
          query={mentionState?.query ?? ""}
          coords={mentionState?.coords ?? null}
          items={mentionItems}
          onSelect={onSelectMention}
          onClose={() => setMentionState(null)}
        />
        {attachmentError ? (
          <p className="border-t border-border-subtle px-3 py-2 text-[12px] text-danger">
            {attachmentError}
          </p>
        ) : null}
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <ToolButton
            title="Add context (@)"
            onClick={openMentionFromButton}
            disabled={busy}
            active={mentionState !== null}
          >
            <AtIcon size={11} />
            Context
          </ToolButton>
          <ToolButton title="Attach files" onClick={() => fileRef.current?.click()} disabled={busy}>
            <AttachIcon size={11} />
            Attach
          </ToolButton>
          {onOpenChanges ? (
            <ToolButton title="View changes" onClick={onOpenChanges} active={changesOpen}>
              <ChangesIcon size={11} />
              Changes
              {changesCount > 0 ? (
                <span className="ml-0.5 rounded-[4px] bg-surface-3 px-1 font-mono text-[10px] text-fg">
                  {changesCount}
                </span>
              ) : null}
            </ToolButton>
          ) : null}
          <span className="flex-1" />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="grid size-8 place-items-center rounded-[8px] bg-surface-3 text-fg transition-colors hover:bg-surface-2"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={trySend}
              disabled={!canSend}
              aria-label="Send"
              className="grid size-8 place-items-center rounded-[8px] bg-fg text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-faint"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
