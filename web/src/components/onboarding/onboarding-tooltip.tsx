import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OnboardingTooltipProps = {
  step: number;
  total: number;
  title: string;
  body: string;
  link?: { url: string; label: string };
  ctaLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  showBack: boolean;
};

export function OnboardingTooltip({
  step,
  total,
  title,
  body,
  link,
  ctaLabel,
  onBack,
  onNext,
  onSkip,
  showBack,
}: OnboardingTooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nextBtn = containerRef.current?.querySelector<HTMLButtonElement>(
      'button[data-onboarding-next="true"]',
    );
    nextBtn?.focus();
  }, [step]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="onboarding-tooltip-title"
      aria-describedby="onboarding-tooltip-body"
      className="flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 text-fg shadow-2xl shadow-black/40 animate-fade-up"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="onboarding-tooltip-title"
          className="text-[14px] font-medium leading-snug text-fg"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label="Skip onboarding"
          onClick={onSkip}
          className="-mr-1 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <p
        id="onboarding-tooltip-body"
        className="text-[13px] leading-relaxed text-fg-muted"
      >
        {body}
      </p>

      {link ? (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-[12.5px] text-accent transition-colors hover:text-fg"
        >
          {link.label}
          <span aria-hidden>↗</span>
        </a>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "block h-1 rounded-full transition-all",
                i === step - 1
                  ? "w-4 bg-accent"
                  : i < step - 1
                    ? "w-1 bg-fg-muted"
                    : "w-1 bg-fg-faint/40",
              )}
            />
          ))}
        </div>
        <span className="sr-only">
          Step {step} of {total}
        </span>
        <div className="flex items-center gap-2">
          {showBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={onNext}
            data-onboarding-next="true"
          >
            {ctaLabel ?? "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
