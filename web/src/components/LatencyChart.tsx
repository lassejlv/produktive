import { useLayoutEffect, useRef, useState } from "react";
import type { Check } from "../lib/types";

interface Props {
  checks: Check[];
  height?: number;
}

/** Latency over time. Expects checks newest-first (as the API returns them). */
export function LatencyChart({ checks, height = 168 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // chronological, only points with a latency value
  const points = checks
    .slice()
    .reverse()
    .map((c) => ({
      t: c.time,
      v: c.latency_ms,
      up: c.status === 1,
      err: c.error_message,
    }));

  const padX = 4;
  const padTop = 14;
  const padBottom = 18;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = height - padTop - padBottom;
  const vals = points.map((p) => p.v ?? 0);
  const maxV = Math.max(1, ...vals);
  const n = points.length;

  const x = (i: number) => (n <= 1 ? padX : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / maxV) * innerH;

  const linePts = points.map((p, i) => `${x(i).toFixed(2)},${y(p.v ?? 0).toFixed(2)}`).join(" ");
  const areaPath =
    n > 0
      ? `M ${x(0).toFixed(2)},${(height - padBottom).toFixed(2)} ` +
        points.map((p, i) => `L ${x(i).toFixed(2)},${y(p.v ?? 0).toFixed(2)}`).join(" ") +
        ` L ${x(n - 1).toFixed(2)},${(height - padBottom).toFixed(2)} Z`
      : "";

  const hp = hover != null ? points[hover] : null;

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        if (n === 0 || innerW <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const rel = e.clientX - rect.left - padX;
        const idx = Math.round((rel / innerW) * (n - 1));
        setHover(Math.min(n - 1, Math.max(0, idx)));
      }}
    >
      {width > 0 && n > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id="lat-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* baseline */}
          <line
            x1={padX}
            x2={width - padX}
            y1={height - padBottom}
            y2={height - padBottom}
            stroke="var(--color-border)"
          />

          <path d={areaPath} fill="url(#lat-fill)" />
          <polyline
            points={linePts}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* down markers */}
          {points.map((p, i) =>
            p.up ? null : (
              <circle key={i} cx={x(i)} cy={height - padBottom} r={2.5} fill="var(--color-err)" />
            ),
          )}

          {/* hover */}
          {hp && (
            <g>
              <line
                x1={x(hover!)}
                x2={x(hover!)}
                y1={padTop - 6}
                y2={height - padBottom}
                stroke="var(--color-border-strong)"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hover!)}
                cy={y(hp.v ?? 0)}
                r={3.5}
                fill="var(--color-bg-elev)"
                stroke={hp.up ? "var(--color-accent)" : "var(--color-err)"}
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      )}

      {hp && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: x(hover!), top: y(hp.v ?? 0) - 10 }}
        >
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-lg)] px-2.5 py-1.5 whitespace-nowrap">
            <div className="mono tabular text-[12px] font-medium text-[var(--color-fg)]">
              {hp.v != null ? `${hp.v} ms` : "no response"}
            </div>
            <div className="text-[10px] text-[var(--color-fg-dim)] tabular">
              {new Date(hp.t).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      )}

      {/* y-axis max label */}
      {n > 0 && (
        <div className="pointer-events-none absolute right-1 top-0 mono text-[10px] text-[var(--color-fg-dim)] tabular">
          {maxV} ms
        </div>
      )}
    </div>
  );
}
