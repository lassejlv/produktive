import type { AiBrief } from "@/lib/api";
import { cn } from "@/lib/utils";

export type AiBriefPanelProps = {
  title: string;
  actionLabel: string;
  actionBusyLabel?: string;
  refreshLabel?: string;
  brief: AiBrief | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  emptyDescription: string;
  className?: string;
};

export function AiBriefPanel({
  title,
  actionLabel,
  actionBusyLabel = "Generating…",
  refreshLabel,
  brief,
  loading,
  error,
  onGenerate,
  emptyDescription,
  className,
}: AiBriefPanelProps) {
  const busy = loading;
  const label = busy ? actionBusyLabel : brief ? (refreshLabel ?? actionLabel) : actionLabel;

  return (
    <section className={cn("border-t border-border-subtle pt-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-fg-muted">{title}</h2>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-border hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {label}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {!brief && !busy ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-faint">{emptyDescription}</p>
      ) : null}

      {brief ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-fg">{brief.summary}</p>
          <AiBriefList title="Risks" items={brief.risks} empty="None noted." />
          <AiBriefList title="Next actions" items={brief.nextActions} empty="None suggested." />
          {brief.statusUpdate ? (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-faint">
                Status update
              </div>
              <p className="rounded-md border border-border-subtle bg-surface/40 px-3 py-2 text-sm leading-snug text-fg-muted">
                {brief.statusUpdate}
              </p>
            </div>
          ) : null}
          <p className="text-[10px] text-fg-faint">{new Date(brief.generatedAt).toLocaleString()}</p>
        </div>
      ) : null}
    </section>
  );
}

function AiBriefList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-faint">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-snug text-fg-muted">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-faint/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
