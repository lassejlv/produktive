import {
  useEffect,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type SheetSide = "right" | "left";

export function Sheet({
  open,
  onClose,
  children,
  className,
  style,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  side?: SheetSide;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const isRight = side === "right";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 bottom-0 flex h-full w-full max-w-[520px] flex-col overflow-hidden",
          "bg-bg/85 backdrop-blur-2xl widget-panel-shadow",
          isRight
            ? "right-0 rounded-l-[14px] border-l border-border-subtle/80 animate-sheet-right"
            : "left-0 rounded-r-[14px] border-r border-border-subtle/80 animate-sheet-left",
          className,
        )}
        style={style}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fg-muted/40 to-transparent"
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-8 w-px bg-gradient-to-b from-transparent via-fg-muted/30 to-transparent",
            isRight ? "left-0" : "right-0",
          )}
        />
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function SheetHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-4 px-5 py-3.5",
        "after:content-[''] after:pointer-events-none after:absolute after:inset-x-5 after:bottom-0 after:h-px",
        "after:bg-gradient-to-r after:from-border-subtle after:via-border-subtle/60 after:to-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SheetTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn("text-[13px] font-medium tracking-tight text-fg", className)}
    >
      {children}
    </h2>
  );
}

export function SheetContent({
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

export function SheetFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-end gap-2 px-5 py-3",
        "before:content-[''] before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-border-subtle before:via-border-subtle/60 before:to-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface/60 hover:text-fg"
      aria-label="Close"
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
