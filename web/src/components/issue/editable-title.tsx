import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function EditableTitle({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    await onSave(trimmed);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const sharedTypography =
    "text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] text-fg text-balance";

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className={cn(
          "block w-full border-0 bg-transparent p-0 outline-none",
          sharedTypography,
          className,
        )}
      />
    );
  }

  return (
    <h1
      role="textbox"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        "m-0 cursor-text outline-none",
        sharedTypography,
        className,
      )}
    >
      {value || (
        <span className="text-fg-faint">Untitled</span>
      )}
    </h1>
  );
}
