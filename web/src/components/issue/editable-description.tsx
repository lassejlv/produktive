import { useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { cn } from "@/lib/utils";

export function EditableDescription({
  value,
  onSave,
  className,
}: {
  value: string | null;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      autoresize(el);
    });
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    const original = value ?? "";
    if (trimmed === original) {
      setDraft(original);
      return;
    }
    await onSave(trimmed);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          autoresize(event.target);
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        placeholder="Add a description…"
        className={cn(
          "block min-h-[96px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.7] text-fg outline-none placeholder:text-fg-faint",
          className,
        )}
      />
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "block w-full cursor-text border-0 bg-transparent p-0 text-left text-[15px] leading-[1.7] text-fg-faint transition-colors hover:text-fg-muted",
          className,
        )}
      >
        Add a description…
      </button>
    );
  }

  return (
    <div
      role="textbox"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        "cursor-text text-[15px] leading-[1.7] text-fg outline-none",
        className,
      )}
    >
      <ChatMarkdown content={value} />
    </div>
  );
}

function autoresize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 720)}px`;
}
