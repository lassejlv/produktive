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
        <LoadingPulse size={10} />
        <span key={tipIndex} className="min-w-0 animate-fade-in truncate">
          {LOADING_TIPS[tipIndex]}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full max-w-sm flex-col items-center gap-5 text-center",
        className,
      )}
    >
      <LoadingPulse size={22} />
      <div className="space-y-1.5">
        <p className="text-shimmer text-[13px] tracking-tight">Loading Produktive</p>
        <p
          key={tipIndex}
          className="animate-fade-in text-[11.5px] leading-relaxed text-fg-faint"
        >
          {LOADING_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}

function LoadingPulse({ size }: { size: number }) {
  const dot = Math.max(2, Math.round(size * 0.45));
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="loading-orbit absolute inset-0 rounded-full bg-fg"
      />
      <span
        aria-hidden
        className="loading-orbit absolute inset-0 rounded-full bg-fg"
        style={{ animationDelay: "0.6s" }}
      />
      <span
        aria-hidden
        className="relative rounded-full bg-fg"
        style={{ width: dot, height: dot }}
      />
    </span>
  );
}
