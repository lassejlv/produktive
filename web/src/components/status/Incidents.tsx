import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "#/lib/cn";
import type { PublicIncident } from "../../lib/types";
import { timeAgo } from "./StatusShell";

/** When a mini history fell off the bottom of the status page, how many to keep. */
const MINI_LIMIT = 5;

function severityColor(incident: PublicIncident): string {
  if (incident.severity === "degraded") return "var(--color-warn)";
  if (incident.severity === "down") return "var(--color-err)";
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

export function IncidentRow({ incident }: { incident: PublicIncident }) {
  const open = incident.status === "open";
  const color = severityColor(incident);
  const title = open
    ? `${incident.monitor_name} is ${incident.severity}`
    : `${incident.monitor_name} recovered`;
  const resolvedAt = incident.resolved_at ?? incident.last_seen_at;
  const lasted = formatDuration(
    new Date(resolvedAt).getTime() - new Date(incident.started_at).getTime(),
  );
  const when = open
    ? `Started ${timeAgo(incident.started_at)}`
    : `Resolved ${timeAgo(resolvedAt)} · lasted ${lasted}`;

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: open ? color : "var(--color-ok)" }}
            />
            <span className="truncate text-[13.5px] font-medium text-[var(--color-fg)]">
              {title}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--color-fg-muted)]">{when}</div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
            open
              ? "bg-[color-mix(in_srgb,var(--color-err)_10%,transparent)]"
              : "bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)]",
          )}
          style={{ color: open ? color : "var(--color-ok)" }}
        >
          {open ? "active" : "resolved"}
        </span>
      </div>
    </div>
  );
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
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
        {sorted.map((incident) => (
          <div key={incident.id} style={{ boxShadow: `inset 2px 0 0 ${severityColor(incident)}` }}>
            <IncidentRow incident={incident} />
          </div>
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
          <h2 className="mb-3 flex items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-err)]">
            <AlertTriangle size={13} />
            Active incidents
          </h2>
          <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
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
          <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
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
      <div className="mb-3 flex items-center justify-between px-0.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
          Incident history
        </h2>
        {href && (
          <a
            href={href}
            className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-link)] hover:underline"
          >
            {hasMore ? "View all" : "View history"}
            <ArrowRight size={12} />
          </a>
        )}
      </div>
      {recent.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-6 text-center text-[12.5px] text-[var(--color-fg-muted)] shadow-[var(--shadow-xs)]">
          No incidents reported.
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
          {recent.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </section>
  );
}
