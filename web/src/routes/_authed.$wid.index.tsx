import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, CheckCircle2, Clock, Plus } from "lucide-react";
import { cn } from "#/lib/cn";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { StatTile } from "../components/StatTile";
import { incidentsQuery, monitorsQuery, useIncidents, useMonitors } from "../lib/queries";
import { STATUS_COLOR, STATUS_LABEL, lastSeen } from "../lib/status";
import { monitorStatus, type Incident, type IncidentSeverity, type Monitor } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/")({
  staticData: {
    title: "Overview",
    description: "Live health of every monitor in this workspace.",
    primaryAction: { label: "New monitor", to: "/$wid/monitors/new", icon: Plus },
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(monitorsQuery(params.wid)),
      context.queryClient.ensureQueryData(incidentsQuery(params.wid, "open")),
    ]),
  component: OverviewPage,
});

function OverviewPage() {
  const { wid } = Route.useParams();
  const { data: monitors = [] } = useMonitors(wid);
  const { data: openIncidents = [] } = useIncidents(wid, "open");

  if (monitors.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No monitors yet"
        description="Add your first endpoint and unstatus will start pinging it on the interval you choose."
        action={
          <Link to="/$wid/monitors/new" params={{ wid }}>
            <Button variant="primary" size="lg">
              <Plus size={14} /> New monitor
            </Button>
          </Link>
        }
      />
    );
  }

  const byStatus = monitors.reduce(
    (acc, m) => {
      acc[monitorStatus(m)] += 1;
      return acc;
    },
    { up: 0, down: 0, degraded: 0, unknown: 0 },
  );
  const attention = monitors
    .filter((m) => {
      const s = monitorStatus(m);
      return s === "down" || s === "degraded";
    })
    .sort(
      (a, b) => (monitorStatus(a) === "down" ? -1 : 1) - (monitorStatus(b) === "down" ? -1 : 1),
    );

  const latencies = monitors.filter((m) => m.last_latency_ms != null);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((s, m) => s + (m.last_latency_ms ?? 0), 0) / latencies.length)
    : null;
  const lastChecked = monitors.reduce<string | null>(
    (latest, m) =>
      m.last_checked_at && (!latest || m.last_checked_at > latest) ? m.last_checked_at : latest,
    null,
  );

  const allGood = byStatus.down === 0 && byStatus.degraded === 0;
  const heroColor = allGood
    ? "var(--color-ok)"
    : byStatus.down
      ? "var(--color-err)"
      : "var(--color-warn)";
  const heroLine = allGood
    ? "All systems operational"
    : [
        byStatus.down ? `${byStatus.down} down` : null,
        byStatus.degraded ? `${byStatus.degraded} degraded` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="flex flex-col gap-7">
      {/* system status hero — one calm line */}
      <div
        className="flex items-center gap-4 rounded-[var(--radius-lg)] border bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]"
        style={{
          borderColor: allGood
            ? "var(--color-border)"
            : `color-mix(in srgb, ${heroColor} 30%, var(--color-border))`,
        }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${heroColor} 14%, transparent)` }}
        >
          <span
            className={cn("inline-block h-[11px] w-[11px] rounded-full", allGood && "pulse-dot")}
            style={{
              background: heroColor,
              boxShadow: `0 0 10px color-mix(in srgb, ${heroColor} 60%, transparent)`,
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-medium tracking-tight text-[var(--color-fg)]">
            {heroLine}
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--color-fg-muted)]">
            {monitors.length} monitor{monitors.length === 1 ? "" : "s"} · {openIncidents.length}{" "}
            open incident{openIncidents.length === 1 ? "" : "s"}
            {lastChecked && ` · last check ${lastSeen(lastChecked)}`}
          </div>
        </div>
        <Link to="/$wid/monitors/new" params={{ wid }} className="shrink-0">
          <Button variant="primary" size="sm">
            <Plus size={14} /> New monitor
          </Button>
        </Link>
      </div>

      {/* tight 4-KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Monitors" value={monitors.length} sub="total tracked" />
        <StatTile
          label="Operational"
          value={byStatus.up}
          accent={byStatus.up > 0 ? "var(--color-ok)" : undefined}
          sub="up now"
        />
        <StatTile
          label="Avg latency"
          value={avgLatency != null ? avgLatency : "—"}
          sub="ms · latest checks"
        />
        <StatTile
          label="Open incidents"
          value={openIncidents.length}
          accent={openIncidents.length > 0 ? "var(--color-err)" : undefined}
          sub="needs attention"
        />
      </div>

      <section>
        <SectionHead>Needs attention</SectionHead>
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-5 text-[13px] text-[var(--color-fg-muted)] shadow-[var(--shadow-xs)]">
            <CheckCircle2 size={16} className="text-[var(--color-ok)]" />
            Every monitor is reporting healthy.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {attention.map((m) => (
              <AttentionRow key={m.id} wid={wid} monitor={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionHead className="mb-0">Open incidents</SectionHead>
          <Link
            to="/$wid/incidents"
            params={{ wid }}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--color-link)] no-underline hover:underline"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {openIncidents.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-5 text-[13px] text-[var(--color-fg-muted)] shadow-[var(--shadow-xs)]">
            No open incidents.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
            {openIncidents.slice(0, 6).map((incident) => (
              <IncidentLine key={incident.id} wid={wid} incident={incident} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Compact list row for a monitor that needs attention — links into the detail. */
function AttentionRow({ wid, monitor }: { wid: string; monitor: Monitor }) {
  const status = monitorStatus(monitor);
  const color = STATUS_COLOR[status];
  return (
    <Link
      to="/$wid/monitors/$mid"
      params={{ wid, mid: monitor.slug || monitor.id }}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)]",
        "bg-[var(--color-bg-elev)] px-4 py-3 no-underline transition-transform hover:-translate-y-[1px]",
      )}
      style={{
        boxShadow:
          status === "down"
            ? "var(--shadow-xs), inset 0 0 0 1px color-mix(in srgb, var(--color-err) 18%, transparent)"
            : "var(--shadow-xs), inset 0 0 0 1px color-mix(in srgb, var(--color-warn) 16%, transparent)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)`,
          }}
        />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-[var(--color-fg)]">
            {monitor.name}
          </div>
          <div className="mono mt-0.5 truncate text-[11.5px] text-[var(--color-fg-dim)]">
            {monitor.target}
          </div>
        </div>
      </div>
      <span className="mono tabular text-right text-[13px] text-[var(--color-fg)]">
        {monitor.last_latency_ms != null ? (
          <>
            {monitor.last_latency_ms}
            <span className="text-[10px] text-[var(--color-fg-dim)]">ms</span>
          </>
        ) : (
          <span className="text-[var(--color-fg-dim)]">—</span>
        )}
      </span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>
        {STATUS_LABEL[status]}
      </span>
    </Link>
  );
}

function IncidentLine({ wid, incident }: { wid: string; incident: Incident }) {
  const color = severityColor(incident.severity);
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)`,
          }}
        />
        <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">
          {incident.title || incident.monitor_name || "Incident"}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          {incident.severity}
        </span>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[var(--color-fg-muted)]">
        <Clock size={12} /> {lastSeen(incident.started_at)}
      </span>
    </>
  );
  const className =
    "flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3 no-underline transition-colors last:border-b-0 hover:bg-[var(--color-bg-row)]";

  if (incident.monitor_id) {
    return (
      <Link
        to="/$wid/monitors/$mid"
        params={{ wid, mid: incident.monitor_slug || incident.monitor_id }}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

function SectionHead({ children, className }: { children: string; className?: string }) {
  return (
    <h2
      className={
        "mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </h2>
  );
}

function severityColor(severity: IncidentSeverity) {
  if (severity === "down" || severity === "critical") return "var(--color-err)";
  if (severity === "degraded" || severity === "maintenance" || severity === "minor") {
    return "var(--color-warn)";
  }
  if (severity === "informational") return "var(--color-accent)";
  return "var(--color-unknown)";
}
