import type { Incident, IncidentSeverity, IncidentUpdateStatus } from "./types";

export function findIncident(incidents: Incident[], id: string) {
  return incidents.find((i) => i.id === id) ?? null;
}

export function incidentHeading(incident: Incident): string {
  if (incident.source === "manual") return incident.title;
  const name = incident.monitor_name ?? incident.title;
  if (incident.status === "open") {
    return `${name} is ${severityLabel(incident.severity).toLowerCase()}`;
  }
  return `${name} recovered`;
}

export function severityColor(severity: IncidentSeverity): string {
  if (severity === "down" || severity === "critical") return "var(--color-err)";
  if (severity === "degraded" || severity === "maintenance" || severity === "minor") {
    return "var(--color-warn)";
  }
  if (severity === "informational") return "var(--color-accent)";
  return "var(--color-unknown)";
}

const SEVERITY_LABELS: Record<Exclude<IncidentSeverity, "unknown">, string> = {
  informational: "Informational",
  maintenance: "Maintenance",
  minor: "Minor",
  degraded: "Degraded",
  down: "Down",
  critical: "Critical",
};

export function severityLabel(severity: IncidentSeverity): string {
  if (severity === "unknown") return "Unknown";
  return SEVERITY_LABELS[severity];
}

export function formatIncidentDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function updateStatusLabel(status: IncidentUpdateStatus): string {
  if (status === "unknown") return "Update";
  return status.replace("_", " ");
}

export function fmtIncidentDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
