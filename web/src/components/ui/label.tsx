import type * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "font-mono text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
