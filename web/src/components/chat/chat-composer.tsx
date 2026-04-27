import { useRef, useState } from "react";
import {
  AttachIcon,
  HashIcon,
  SendIcon,
  SlashIcon,
  StopIcon,
} from "@/components/chat/icons";

export function ChatComposer({
  busy,
  onSend,
  onStop,
}: {
  busy: boolean;
  onSend: (value: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

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
    if (!trimmed || busy) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => autoresize(taRef.current));
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySend();
    }
  };

  const canSend = value.trim().length > 0 && !busy;

  return (
    <div className="relative z-10 bg-bg/92 px-6 pb-5 pt-3">
      <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-[14px] border border-border bg-surface/80 transition-colors focus-within:border-[#4a4a52] focus-within:bg-surface-2">
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
        <div className="flex items-center gap-1.5 px-3 pb-3 pt-1.5">
          <ToolButton title="Attach">
            <AttachIcon />
            Attach
          </ToolButton>
          <ToolButton title="Reference issue">
            <HashIcon />
            Issue
          </ToolButton>
          <ToolButton title="Slash command">
            <SlashIcon />
            Command
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
      <p className="mt-2 text-center text-[11px] text-fg-faint">
        <Kbd>Enter</Kbd> to send · <Kbd>⇧ Enter</Kbd> for newline · <Kbd>/</Kbd> for
        commands
      </p>
    </div>
  );
}

function ToolButton({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border bg-surface/50 px-2.5 text-[12px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
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
