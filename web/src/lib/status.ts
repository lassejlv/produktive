import type { DeployStatus, MonitorStatus } from "./types";

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

export const DEPLOY_STATUS_COLOR: Record<DeployStatus, string> = {
  live: "var(--color-ok)",
  healthy: "var(--color-ok)",
  failed: "var(--color-err)",
  stopped: "var(--color-fg-muted)",
  rolled_back: "var(--color-fg-dim)",
  queued: "var(--color-warn)",
  provisioning: "var(--color-warn)",
  pulling: "var(--color-warn)",
  starting: "var(--color-warn)",
  rolling_back: "var(--color-warn)",
  unknown: "var(--color-unknown)",
};

export const DEPLOY_STATUS_LABEL: Record<DeployStatus, string> = {
  live: "Live",
  healthy: "Healthy",
  failed: "Failed",
  stopped: "Stopped",
  rolled_back: "Rolled back",
  queued: "Queued",
  provisioning: "Provisioning",
  pulling: "Pulling",
  starting: "Starting",
  rolling_back: "Rolling back",
  unknown: "Unknown",
};

export function deployStatusActive(status: DeployStatus): boolean {
  return status === "live" || status === "healthy";
}

export function deployStatusPending(status: DeployStatus): boolean {
  return (
    status === "queued" ||
    status === "provisioning" ||
    status === "pulling" ||
    status === "starting" ||
    status === "rolling_back"
  );
}

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
