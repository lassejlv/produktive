import { cn } from "#/lib/cn";

interface Props {
  size?: number;
  className?: string;
  thickness?: number;
  label?: string;
}

export function Spinner({ size = 16, thickness = 2, className, label }: Props) {
  return (
    <span
      role="status"
      aria-label={label ?? "loading"}
      className={cn("inline-block align-[-2px] spin", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${thickness}px solid currentColor`,
        borderTopColor: "transparent",
        opacity: 0.85,
      }}
    />
  );
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh] fade-in">
      <div className="flex flex-col items-center gap-3 text-[var(--color-fg-muted)]">
        <Spinner size={22} thickness={2} />
        {label && <span className="text-[12px]">{label}</span>}
      </div>
    </div>
  );
}
