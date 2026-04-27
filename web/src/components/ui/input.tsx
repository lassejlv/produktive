import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors",
        "placeholder:text-fg-faint",
        "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
