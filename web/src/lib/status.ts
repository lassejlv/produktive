import type { MonitorStatus } from "./types";

export const STATUS_COLOR: Record<MonitorStatus, string> = {
  up: "var(--color-ok)",
  down: "var(--color-err)",
  degraded: "var(--color-warn)",
  unknown: "var(--color-unknown)",
};

export const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "Operational",
  down: "Down",
  degraded: "Degraded",
  unknown: "Idle",
};

export const GLOW_CLASS: Record<MonitorStatus, string> = {
  up: "glow-up",
  down: "glow-down",
  degraded: "glow-warn",
  unknown: "glow-unknown",
};

export function lastSeen(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
