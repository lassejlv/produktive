import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[8px] border border-border-subtle bg-surface/50 px-3 py-2 text-sm text-fg outline-none",
        "transition-[border-color,box-shadow,background-color] duration-150",
        "placeholder:text-fg-faint",
        "hover:border-border hover:bg-surface/70",
        "focus-visible:border-accent/60 focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
