import { cn } from "@/lib/utils";

export function Spinner({
  size = 12,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const borderWidth = size <= 10 ? 1 : 2;
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderWidth: `${borderWidth}px`,
      }}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-solid",
        "border-current/25 border-t-current",
        className,
      )}
    />
  );
}
