import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Shortcut = {
  keys: string[];
  label: string;
};

type ShortcutGroup = {
  title: string;
  shortcuts: Shortcut[];
};

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: [mod, "K"], label: "Open command palette" },
      { keys: ["?"], label: "Show this help" },
      { keys: ["Esc"], label: "Close dialog or menu" },
    ],
  },
  {
    title: "Issues",
    shortcuts: [
      { keys: ["C"], label: "New issue" },
      { keys: ["J"], label: "Move down" },
      { keys: ["K"], label: "Move up" },
      { keys: ["X"], label: "Multi-select issue" },
      { keys: ["↵"], label: "Open issue" },
    ],
  },
  {
    title: "Chat",
    shortcuts: [
      { keys: ["↵"], label: "Send message" },
      { keys: ["⇧", "↵"], label: "New line in composer" },
    ],
  },
];

const isTypingIn = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingIn(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} className="max-w-md">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
      </DialogHeader>
      <DialogContent className="grid gap-4">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="m-0 mb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              {group.title}
            </h3>
            <ul className="grid gap-1.5">
              {group.shortcuts.map((shortcut) => (
                <li
                  key={shortcut.label}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span className="text-fg-muted">{shortcut.label}</span>
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="grid min-h-5 min-w-5 place-items-center rounded-[4px] border border-border-subtle bg-surface px-1.5 font-mono text-[11px] text-fg"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
