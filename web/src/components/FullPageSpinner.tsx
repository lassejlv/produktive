import { Spinner } from "#/components/ui/spinner";

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh] fade-in">
      <div className="flex flex-col items-center gap-3 text-[var(--color-fg-muted)]">
        <Spinner className="size-5.5" />
        {label && <span className="text-[12px]">{label}</span>}
      </div>
    </div>
  );
}
