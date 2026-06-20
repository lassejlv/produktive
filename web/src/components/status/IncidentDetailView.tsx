import { ArrowLeft } from "lucide-react";
import type { PublicIncident, PublicIncidentUpdate, StatusStyle } from "../../lib/types";
import { StatusShell, timeAgo } from "./StatusShell";

interface Props {
  title: string;
  incident: PublicIncident;
  /** Link back to the incident history page. */
  incidentsHref: string;
  style: StatusStyle;
  showBranding?: boolean;
}

function severityColor(incident: PublicIncident): string {
  if (incident.severity === "down" || incident.severity === "critical") {
    return "var(--color-err)";
  }
  if (
    incident.severity === "degraded" ||
    incident.severity === "maintenance" ||
    incident.severity === "minor"
  ) {
    return "var(--color-warn)";
  }
  if (incident.severity === "informational") return "var(--color-accent)";
  return "var(--color-unknown)";
}

function severityLabel(severity: PublicIncident["severity"]): string {
  switch (severity) {
    case "informational":
      return "Informational";
    case "maintenance":
      return "Maintenance";
    case "minor":
      return "Minor";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    case "critical":
      return "Critical";
    default:
      return "Unknown";
  }
}

function incidentTitle(incident: PublicIncident): string {
  if (incident.source === "manual") return incident.title;
  const name = incident.monitor_name ?? incident.title;
  if (incident.status === "open") {
    return `${name} is ${severityLabel(incident.severity).toLowerCase()}`;
  }
  return `${name} recovered`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function updateStatusLabel(status: PublicIncidentUpdate["status"]): string {
  if (status === "unknown") return "Update";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Dedicated `<status>/incidents/:id` page with the full update timeline. */
export function IncidentDetailView({
  title,
  incident,
  incidentsHref,
  style,
  showBranding = true,
}: Props) {
  const open = incident.status === "open";
  const color = severityColor(incident);
  const heading = incidentTitle(incident);
  const resolvedAt = incident.resolved_at ?? incident.last_seen_at;
  const duration = formatDuration(
    new Date(resolvedAt).getTime() - new Date(incident.started_at).getTime(),
  );
  const updates = [...incident.updates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <StatusShell
      title={title}
      style={style}
      documentTitle={`${title} — ${heading}`}
      showBranding={showBranding}
    >
      <div className="pb-8 pt-10">
        <a
          href={incidentsHref}
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={13} />
          Back to incidents
        </a>

        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: open ? color : "var(--color-ok)" }}
          />
          <div className="min-w-0">
            <h1 className="text-[26px] font-medium leading-tight tracking-tight">
              {heading}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-fg-muted)]">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                }}
              >
                {severityLabel(incident.severity)}
              </span>
              <span className={open ? "text-[var(--color-err)]" : "text-[var(--color-ok)]"}>
                {open ? "Active" : "Resolved"}
              </span>
              <span>Started {fmtDateTime(incident.started_at)}</span>
              {!open && (
                <span>
                  Resolved {fmtDateTime(resolvedAt)} · lasted {duration}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
          Updates
        </h2>
        {updates.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">
            No updates have been posted for this incident.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
            {updates.map((update, i) => (
              <div
                key={update.id}
                className={
                  i > 0 ? "border-t border-[var(--color-border)] px-4 py-4" : "px-4 py-4"
                }
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="font-medium text-[var(--color-fg)]">
                    {updateStatusLabel(update.status)}
                  </span>
                  <span className="text-[var(--color-fg-dim)]">
                    {timeAgo(update.created_at)}
                  </span>
                  <span className="text-[var(--color-fg-dim)]">·</span>
                  <span className="text-[var(--color-fg-dim)]">
                    {fmtDateTime(update.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                  {update.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </StatusShell>
  );
}
