import { cn } from "@/lib/utils";

type Size = "sm" | "md";

const dimensions: Record<Size, { box: number; stroke: number; r: number }> = {
  sm: { box: 14, stroke: 1.5, r: 5 },
  md: { box: 18, stroke: 1.6, r: 6.5 },
};

export function ProjectStatusIcon({
  status,
  progress = 0, // 0–1, used for in-progress arc
  size = "md",
  className,
}: {
  status: string;
  progress?: number;
  size?: Size;
  className?: string;
}) {
  const { box, stroke, r } = dimensions[size];
  const cx = box / 2;
  const cy = box / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, progress)) * circumference;

  if (status === "completed") {
    return (
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className={cn("text-success", className)}
        aria-hidden
      >
        <circle cx={cx} cy={cy} r={r} fill="currentColor" />
        <path
          d={`M${cx - 2.5} ${cy} l1.7 1.8 3.3 -3.5`}
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }

  if (status === "cancelled") {
    return (
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className={cn("text-fg-faint", className)}
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
        />
        <path
          d={`M${cx - 2} ${cy - 2} l4 4 M${cx + 2} ${cy - 2} l-4 4`}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status === "in-progress") {
    return (
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className={cn("text-accent", className)}
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          opacity="0.35"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
    );
  }

  // planned (default)
  return (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      className={cn("text-fg-faint", className)}
      aria-hidden
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray="2 2"
        fill="none"
      />
    </svg>
  );
}
