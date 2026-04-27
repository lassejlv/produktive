import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-none border-0 border-b border-ink/40 bg-transparent px-1 py-2 text-[13px] text-ink outline-none transition-all duration-200",
        "placeholder:text-ink-faint placeholder:italic placeholder:font-serif placeholder:text-[14px]",
        "focus-visible:border-b-vermilion focus-visible:border-b-2 focus-visible:placeholder:text-ink-muted",
        "hover:border-b-ink",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}
