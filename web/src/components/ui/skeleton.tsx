import type * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse-subtle rounded-lg bg-neutral-800/60", className)}
      {...props}
    />
  );
}
