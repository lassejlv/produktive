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
          "flex min-w-0 items-center gap-2 text-xs text-fg-faint",
          className,
        )}
      >
        <span className="inline-block size-2.5 shrink-0 animate-spin rounded-full border border-border border-t-fg-muted" />
        <span className="min-w-0 truncate">{LOADING_TIPS[tipIndex]}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full max-w-sm flex-col items-center gap-3 text-center",
        className,
      )}
    >
      <span className="inline-block size-5 animate-spin rounded-full border-2 border-border border-t-fg-muted" />
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Loading Produktive</p>
        <p className="text-xs leading-relaxed text-fg-faint">
          {LOADING_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}
