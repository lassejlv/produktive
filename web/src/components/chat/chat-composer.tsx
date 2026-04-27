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
    <div className="relative bg-gradient-to-b from-transparent to-bg px-6 pb-5 pt-3">
      <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-border bg-surface transition-colors focus-within:border-[#3a4d8a] focus-within:bg-surface-2">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Ask Produktive, or type / for commands…"
          className="block min-h-[44px] w-full resize-none border-0 bg-transparent px-[14px] pb-1 pt-3 text-sm leading-[1.55] text-fg outline-none placeholder:text-fg-faint"
          style={{ maxHeight: 240 }}
        />
        <div className="flex items-center gap-1 px-2 pb-2 pt-1.5">
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
              className="grid size-[30px] place-items-center rounded-[7px] bg-surface-3 text-fg transition-colors hover:bg-surface-2"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={trySend}
              disabled={!canSend}
              aria-label="Send"
              className="grid size-[30px] place-items-center rounded-[7px] bg-fg text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-faint"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center font-mono text-[10.5px] text-fg-faint">
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
      className="inline-flex h-[26px] items-center gap-1.5 rounded-md px-2 text-[11.5px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-subtle bg-surface px-[5px] py-px font-mono text-[10px]">
      {children}
    </kbd>
  );
}
