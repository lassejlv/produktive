import { Link, useParams } from "@tanstack/react-router";
import { memo } from "react";
import { cn } from "#/lib/cn";
import { monitorStatus, type Monitor, type MonitorStatus } from "../lib/types";
import { GLOW_CLASS, STATUS_COLOR, STATUS_LABEL, lastSeen } from "../lib/status";
import { MonitorMenu } from "./MonitorMenu";
import { PROBE_ICON } from "./ProbeIcons";

interface Props {
  monitor: Monitor;
  /** Rendered as a draggable node on the canvas (fixed width, propagation guards). */
  canvas?: boolean;
}

export const MonitorCard = memo(function MonitorCard({ monitor, canvas }: Props) {
  const { wid } = useParams({ from: "/_authed/$wid" });
  const mid = monitor.slug || monitor.id;
  const status = monitorStatus(monitor);
  const color = STATUS_COLOR[status];
  const KindIcon = PROBE_ICON[monitor.kind];

  return (
    <div
      className={cn(
        "group relative bg-[var(--color-bg-elev)] rounded-[var(--radius-lg)]",
        "overflow-hidden transition-all duration-200",
        "border border-[var(--color-border)]",
        GLOW_CLASS[status],
        "hover:-translate-y-[1px]",
        canvas ? "w-[300px] select-none" : "w-full",
      )}
      style={{
        boxShadow:
          status === "down"
            ? "var(--shadow-md), 0 0 0 1px color-mix(in srgb, var(--color-err) 14%, transparent), 0 12px 32px -12px color-mix(in srgb, var(--color-err) 30%, transparent)"
            : status === "degraded"
              ? "var(--shadow-md), 0 0 0 1px color-mix(in srgb, var(--color-warn) 14%, transparent)"
              : "var(--shadow-md)",
      }}
    >
      <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full shrink-0",
              status === "up" && "pulse-dot",
            )}
            style={{
              background: color,
              boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)`,
            }}
          />
          <Link
            to="/$wid/monitors/$mid"
            params={{ wid, mid }}
            className="truncate text-[13px] text-[var(--color-fg)] no-underline hover:text-[var(--color-link)] font-medium tracking-tight"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {monitor.name}
          </Link>
        </div>
        <div className="shrink-0 -mr-1">
          <MonitorMenu monitor={monitor} canvas={canvas} />
        </div>
      </div>

      <div className="px-4 py-3.5">
        <div className="flex items-end justify-between mb-3.5">
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color }}
            >
              {STATUS_LABEL[status]}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="mono tabular text-[24px] leading-none text-[var(--color-fg)] font-medium">
                {monitor.last_latency_ms != null ? monitor.last_latency_ms : "—"}
              </span>
              <span className="text-[11px] text-[var(--color-fg-dim)]">ms</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              interval
            </div>
            <div className="mono tabular text-[var(--color-fg-muted)] text-[12px] mt-1.5">
              {monitor.interval_seconds}s
            </div>
          </div>
        </div>

        <UptimeBar enabled={monitor.enabled && !monitor.billing_paused_at} status={status} />

        <div className="mt-3 flex items-center justify-between text-[var(--color-fg-dim)] text-[11px]">
          <span className="flex items-center gap-1.5 min-w-0">
            <KindIcon size={11} className="shrink-0" />
            <span className="mono truncate">{monitor.target}</span>
          </span>
          <span className="shrink-0 ml-2 tabular">{lastSeen(monitor.last_checked_at)}</span>
        </div>
      </div>
    </div>
  );
});

export function UptimeBar({
  enabled,
  status,
  ticks = 30,
}: {
  enabled: boolean;
  status: MonitorStatus;
  ticks?: number;
}) {
  const items = Array.from({ length: ticks }, (_, i) => {
    if (!enabled) return "paused";
    if (status === "unknown") return "unknown";
    if (i === ticks - 1) return status === "down" ? "down" : status === "degraded" ? "warn" : "up";
    return "up";
  });

  return (
    <div className="flex items-center gap-[2px] h-2.5">
      {items.map((kind, i) => (
        <span
          key={i}
          className="flex-1 h-full rounded-[2px]"
          style={{
            background:
              kind === "up"
                ? "var(--color-ok)"
                : kind === "warn"
                  ? "var(--color-warn)"
                  : kind === "down"
                    ? "var(--color-err)"
                    : "var(--color-border-hi)",
            opacity: kind === "unknown" || kind === "paused" ? 0.55 : 0.92,
          }}
        />
      ))}
    </div>
  );
}
