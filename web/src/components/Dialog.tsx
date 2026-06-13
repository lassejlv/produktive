import * as RDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "#/lib/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </RDialog.Root>
  );
}

interface ContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<NonNullable<ContentProps["size"]>, string> = {
  sm: "max-w-[380px]",
  md: "max-w-[480px]",
  lg: "max-w-[640px]",
};

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: ContentProps) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay
        className="dialog-overlay fixed inset-0 z-50"
        style={{
          background: "color-mix(in srgb, var(--color-fg) 18%, transparent)",
          backdropFilter: "blur(4px)",
        }}
      />
      <RDialog.Content
        className={cn(
          "dialog-content fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-[calc(100vw-32px)]",
          sizeMap[size],
          "bg-[var(--color-bg-elev)] border border-[var(--color-border)] rounded-[var(--radius-lg)]",
          "shadow-[var(--shadow-pop)] p-6 flex flex-col gap-4",
          className,
        )}
      >
        <div className="flex flex-col gap-1.5">
          <RDialog.Title className="text-[15px] font-medium text-[var(--color-fg)] tracking-tight">
            {title}
          </RDialog.Title>
          {description && (
            <RDialog.Description className="text-[13px] text-[var(--color-fg-muted)] leading-relaxed">
              {description}
            </RDialog.Description>
          )}
        </div>
        {children && <div className="text-[13px] text-[var(--color-fg)]">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 pt-2">{footer}</div>}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;
