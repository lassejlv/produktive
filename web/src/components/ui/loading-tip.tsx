import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LOADING_TIPS = [
  "Tip: press / in chat to open commands.",
  "Tip: attach screenshots when the context matters.",
  "Tip: pin important chats so they stay in the sidebar.",
  "Tip: use markdown in issues for cleaner specs.",
  "Tip: open changes to review what the agent edited.",
  "Tip: keep issue titles short and searchable.",
  "Tip: mention an issue in chat to keep work connected.",
  "Tip: use priorities sparingly. The queue gets quieter.",
];

type LoadingTipProps = {
  compact?: boolean;
  className?: string;
};

export function LoadingTip({ compact = false, className }: LoadingTipProps) {
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * LOADING_TIPS.length),
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % LOADING_TIPS.length);
    }, 3600);

    return () => window.clearInterval(interval);
  }, []);

  if (compact) {
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 text-[12px] text-fg-faint",
          className,
        )}
      >
        <span className="inline-block size-2.5 shrink-0 animate-spin rounded-full border border-border border-t-fg-muted" />
        <span className="min-w-0 truncate">{LOADING_TIPS[tipIndex]}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full max-w-[420px] flex-col items-center", className)}>
      <div className="relative mb-5 grid size-12 place-items-center rounded-[14px] border border-border bg-surface">
        <span className="absolute inset-[-1px] animate-pulse rounded-[15px] border border-fg/10" />
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-border border-t-fg" />
      </div>
      <div className="text-[14px] font-medium tracking-[-0.01em] text-fg">
        Loading Produktive
      </div>
      <div className="mt-2 min-h-5 text-center text-[13px] leading-5 text-fg-muted transition-opacity">
        {LOADING_TIPS[tipIndex]}
      </div>
    </div>
  );
}
