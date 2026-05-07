import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SidePane({
  open,
  onClose,
  children,
  className,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      role="complementary"
      style={{ width: `${width}px` }}
      className={cn(
        "fixed right-0 top-0 bottom-0 z-30 flex flex-col overflow-hidden",
        "bg-bg/85 backdrop-blur-2xl widget-panel-shadow",
        "rounded-l-[14px] border-l border-border-subtle/80",
        "animate-sheet-right",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fg-muted/40 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 inset-y-8 w-px bg-gradient-to-b from-transparent via-fg-muted/30 to-transparent"
      />
      {children}
    </aside>
  );
}

export function SidePaneHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-3 px-4 py-2.5",
        "after:content-[''] after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px",
        "after:bg-gradient-to-r after:from-border-subtle after:via-border-subtle/60 after:to-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidePaneBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>{children}</div>
  );
}

export function SidePaneFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-end gap-2 px-4 py-2.5",
        "before:content-[''] before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-border-subtle before:via-border-subtle/60 before:to-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidePaneClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface/60 hover:text-fg"
      aria-label="Close"
      title="Close (Esc)"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M3 3l8 8M11 3l-8 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
