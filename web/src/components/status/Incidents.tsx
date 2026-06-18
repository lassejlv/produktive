import { ArrowRight } from "lucide-react";
import type { PublicIncident } from "../../lib/types";

/** When a mini history fell off the bottom of the status page, how many to keep. */
const MINI_LIMIT = 5;

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

/** Most recent first, with active incidents always ahead of resolved ones. */
export function sortIncidents(incidents: PublicIncident[]): PublicIncident[] {
  const ts = (i: PublicIncident) =>
    new Date(i.status === "open" ? i.started_at : (i.resolved_at ?? i.last_seen_at)).getTime();
  return [...incidents].sort((a, b) => {
    const ao = a.status === "open" ? 1 : 0;
    const bo = b.status === "open" ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return ts(b) - ts(a);
  });
}

/** "6m", "2h", "3d" — coarse incident duration. */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function IncidentRow({ incident }: { incident: PublicIncident }) {
  const open = incident.status === "open";
  const color = severityColor(incident);
  const title =
    incident.source === "manual"
      ? incident.title
      : open
        ? `${incident.monitor_name ?? incident.title} is ${severityLabel(incident.severity)}`
        : `${incident.monitor_name ?? incident.title} recovered`;
  const resolvedAt = incident.resolved_at ?? incident.last_seen_at;
  const when = open
    ? fmtDate(incident.started_at)
    : `${fmtDate(resolvedAt)} · ${formatDuration(
        new Date(resolvedAt).getTime() - new Date(incident.started_at).getTime(),
      )}`;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: open ? color : "var(--color-ok)" }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-[var(--color-fg)]">{title}</div>
        <div className="text-[11px] text-[var(--color-fg-dim)]">{when}</div>
      </div>
    </div>
  );
}

function severityLabel(severity: PublicIncident["severity"]): string {
  switch (severity) {
    case "informational":
      return "informational";
    case "maintenance":
      return "under maintenance";
    case "minor":
      return "minorly impacted";
    case "degraded":
      return "degraded";
    case "down":
      return "down";
    case "critical":
      return "critically impacted";
    default:
      return "unknown";
  }
}

/**
 * Open incidents pinned directly under the overall banner on the status page —
 * what's broken should never be buried below 90 days of history. Each row gets
 * a severity rail; renders nothing when everything is healthy.
 */
export function ActiveIncidents({
  incidents,
  className,
}: {
  incidents: PublicIncident[];
  className?: string;
}) {
  if (incidents.length === 0) return null;
  const sorted = sortIncidents(incidents);
  return (
    <section className={className}>
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
        {sorted.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} />
        ))}
      </div>
    </section>
  );
}

/**
 * Full incident history, shown on the dedicated `<status>/incidents` page.
 * Active incidents are split out above the resolved history.
 */
export function IncidentList({ incidents }: { incidents: PublicIncident[] }) {
  const sorted = sortIncidents(incidents);
  const open = sorted.filter((i) => i.status === "open");
  const resolved = sorted.filter((i) => i.status !== "open");

  if (sorted.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-12 text-center text-[13px] text-[var(--color-fg-muted)] shadow-[var(--shadow-xs)]">
        No incidents have been reported.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {open.length > 0 && (
        <section>
          <h2 className="mb-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
            Active incidents
          </h2>
          <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
            {open.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}
          </div>
        </section>
      )}
      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
            Past incidents
          </h2>
          <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
            {resolved.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Minimal incident recap pinned to the bottom of the status page. Shows the
 * most recent few incidents and links out to the full history.
 */
export function MiniIncidentHistory({
  incidents,
  href,
  className,
}: {
  incidents: PublicIncident[];
  /** Link to the full `<status>/incidents` page; omitted in editor previews. */
  href?: string;
  className?: string;
}) {
  const sorted = sortIncidents(incidents);
  const recent = sorted.slice(0, MINI_LIMIT);
  const hasMore = sorted.length > recent.length;

  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h2 className="text-[13px] font-medium text-[var(--color-fg-muted)]">
          Incidents
        </h2>
        {href && (
          <a
            href={href}
            className="flex items-center gap-1 text-[12px] text-[var(--color-link)] hover:underline"
          >
            {hasMore ? "View all" : "View history"}
            <ArrowRight size={12} />
          </a>
        )}
      </div>
      {recent.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-5 text-center text-[12px] text-[var(--color-fg-muted)]">
          No incidents reported.
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
          {recent.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </section>
  );
}
