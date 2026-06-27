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
  build_failed: "var(--color-err)",
  stopped: "var(--color-fg-muted)",
  rolled_back: "var(--color-fg-dim)",
  building: "var(--color-warn)",
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
  build_failed: "Build failed",
  stopped: "Stopped",
  rolled_back: "Rolled back",
  building: "Building",
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
    status === "building" ||
    status === "queued" ||
    status === "provisioning" ||
    status === "pulling" ||
    status === "starting" ||
    status === "rolling_back"
  );
}

export const DEPLOY_GLOW_CLASS: Record<DeployStatus, string> = {
  live: "glow-up",
  healthy: "glow-up",
  failed: "glow-down",
  build_failed: "glow-down",
  stopped: "glow-unknown",
  rolled_back: "glow-unknown",
  building: "glow-warn",
  queued: "glow-warn",
  provisioning: "glow-warn",
  pulling: "glow-warn",
  starting: "glow-warn",
  rolling_back: "glow-warn",
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

/**
 * Short, display-friendly image digest. Pulls the leading 12 chars of a
 * `sha256:…` digest (the same width `docker` shows); returns null when there's
 * nothing to abbreviate.
 */
export function shortDigest(digest: string | null): string | null {
  if (!digest) return null;
  const stripped = digest.startsWith("sha256:") ? digest.slice(7) : digest;
  if (!stripped) return null;
  return stripped.slice(0, 12);
}
