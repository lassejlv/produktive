import { useMemo, useRef, useState } from "react";
import {
  AttachIcon,
  ChangesIcon,
  HashIcon,
  SendIcon,
  SlashIcon,
  StopIcon,
} from "@/components/chat/icons";
import {
  IssuePicker,
  type PickableIssue,
} from "@/components/chat/issue-picker";
import { StatusIcon } from "@/components/issue/status-icon";
import {
  type ChatAttachmentDraft,
  type ReferencedIssue,
  formatBytes,
  formatIssueReferences,
  prepareChatAttachments,
} from "@/lib/chat-attachments";
import { cn } from "@/lib/utils";

export function ChatComposer({
  busy,
  onSend,
  onStop,
  onOpenChanges,
  changesCount = 0,
  changesOpen = false,
}: {
  busy: boolean;
  onSend: (value: string, attachments: ChatAttachmentDraft[]) => void;
  onStop: () => void;
  onOpenChanges?: () => void;
  changesCount?: number;
  changesOpen?: boolean;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ReferencedIssue[]>([]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selectedIssueIds = useMemo(
    () => new Set(issues.map((issue) => issue.id)),
    [issues],
  );

  const autoresize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    autoresize(event.target);
  };

  const trySend = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0 && issues.length === 0) || busy) {
      return;
    }
    const fallback = attachments.length > 0 ? "Review the attached files." : "";
    const baseText = trimmed || fallback;
    const outgoing = `${baseText}${formatIssueReferences(issues)}`.trim();
    onSend(outgoing, attachments);
    setValue("");
    setAttachments([]);
    setAttachmentError(null);
    setIssues([]);
    requestAnimationFrame(() => autoresize(taRef.current));
  };

  const toggleIssue = (issue: PickableIssue) => {
    setIssues((current) => {
      if (current.some((existing) => existing.id === issue.id)) {
        return current.filter((existing) => existing.id !== issue.id);
      }
      return [...current, issue];
    });
  };

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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySend();
    }
  };

  const canSend =
    (value.trim().length > 0 || attachments.length > 0 || issues.length > 0) &&
    !busy;

  return (
    <div className="relative z-10 px-6 pb-3 pt-2">
      <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-[14px] border border-border bg-surface/80 transition-colors focus-within:border-[#4a4a52] focus-within:bg-surface-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        {attachments.length > 0 || issues.length > 0 ? (
          <div className="border-b border-border-subtle px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-border bg-bg px-2 py-1 text-[11px] text-fg-muted"
                >
                  <StatusIcon status={issue.status} />
                  <span className="max-w-[220px] truncate text-fg">
                    {issue.title}
                  </span>
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
                  className="inline-flex max-w-full items-center gap-2 rounded-[6px] border border-border bg-bg px-2 py-1 font-mono text-[11px] text-fg-muted"
                >
                  <span className="max-w-[220px] truncate text-fg">
                    {file.file.name}
                  </span>
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
          rows={1}
          placeholder="Ask Produktive, or type / for commands…"
          className="block min-h-[46px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3.5 text-[14px] leading-[1.55] text-fg outline-none placeholder:text-fg-muted"
          style={{ maxHeight: 240 }}
        />
        {attachmentError ? (
          <p className="border-t border-border-subtle px-3 py-2 text-[12px] text-danger">
            {attachmentError}
          </p>
        ) : null}
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <ToolButton
            title="Attach files"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <AttachIcon size={11} />
            Attach
          </ToolButton>
          <IssuePicker
            selectedIds={selectedIssueIds}
            onToggle={toggleIssue}
            trigger={({ open, onClick }) => (
              <ToolButton
                title="Reference issue"
                onClick={onClick}
                disabled={busy}
                active={open}
              >
                <HashIcon size={11} />
                Issue
              </ToolButton>
            )}
          />
          <ToolButton title="Slash command">
            <SlashIcon size={11} />
            Command
          </ToolButton>
          <ToolButton
            title="View changes"
            onClick={onOpenChanges}
            active={changesOpen}
          >
            <ChangesIcon size={11} />
            Changes
            {changesCount > 0 ? (
              <span className="ml-0.5 rounded-[4px] bg-surface-3 px-1 font-mono text-[10px] text-fg">
                {changesCount}
              </span>
            ) : null}
          </ToolButton>
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
        active
          ? "bg-surface-2 text-fg"
          : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-1 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  );
}
