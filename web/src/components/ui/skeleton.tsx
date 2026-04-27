import type * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse-ink rounded-none bg-ink/10",
        className,
      )}
      {...props}
    />
  );
}
