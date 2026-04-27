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
    <div className="relative z-10 bg-gradient-to-b from-transparent via-bg/68 to-bg px-8 pb-8 pt-5">
      <div className="mx-auto w-full max-w-[900px] overflow-hidden rounded-[24px] border border-[#3a3a40] bg-surface/88 shadow-[0_22px_70px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-colors focus-within:border-[#5b5b64] focus-within:bg-surface-2">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Ask Produktive, or type / for commands…"
          className="block min-h-[70px] w-full resize-none border-0 bg-transparent px-7 pb-2 pt-7 text-[17px] leading-[1.55] text-fg outline-none placeholder:text-fg-muted"
          style={{ maxHeight: 240 }}
        />
        <div className="flex items-center gap-2 px-5 pb-5 pt-2">
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
              className="grid size-10 place-items-center rounded-[12px] bg-surface-3 text-fg transition-colors hover:bg-surface-2"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={trySend}
              disabled={!canSend}
              aria-label="Send"
              className="grid size-10 place-items-center rounded-[12px] bg-fg text-bg shadow-[0_10px_25px_rgba(255,255,255,0.08)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-faint disabled:shadow-none"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-[12px] text-fg-faint">
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
      className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-border bg-surface/60 px-3 text-[14px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-1 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 font-mono text-[11px]">
      {children}
    </kbd>
  );
}
