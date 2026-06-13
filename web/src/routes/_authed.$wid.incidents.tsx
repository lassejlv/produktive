import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, ScrollText } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "../components/Spinner";
import { incidentsQuery, useIncidents } from "../lib/queries";
import type { Incident, IncidentSeverity } from "../lib/types";
import { lastSeen } from "../lib/status";
import { cn } from "#/lib/cn";

type Filter = "open" | "all" | "resolved";

export const Route = createFileRoute("/_authed/$wid/incidents")({
  staticData: {
    title: "Incidents",
    description: "Private incident history generated from monitor state changes.",
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(incidentsQuery(params.wid, "open")),
  component: IncidentsPage,
});

function IncidentsPage() {
  const { wid } = Route.useParams();
  const [filter, setFilter] = useState<Filter>("open");
  const { data: incidents = [], isLoading } = useIncidents(wid, filter);

  return (
    <>
      <PageActions>
        <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-0.5">
          {(["open", "all", "resolved"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "h-7 rounded-[var(--radius-sm)] px-2.5 text-[12px] capitalize transition-colors",
                filter === value
                  ? "border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
                  : "border border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </PageActions>

      {isLoading ? (
        <div className="flex h-[280px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
          <Spinner size={16} /> <span className="ml-2">loading incidents...</span>
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filter === "open" ? "No open incidents" : "No incidents yet"}
          description="Incidents are created automatically when a monitor becomes degraded or down."
        />
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <IncidentRow key={incident.id} wid={wid} incident={incident} />
          ))}
        </div>
      )}
    </>
  );
}

function IncidentRow({ wid, incident }: { wid: string; incident: Incident }) {
  const open = incident.status === "open";
  const color = severityColor(incident.severity);
  const Icon = open ? AlertTriangle : CheckCircle2;
  const duration = incident.resolved_at
    ? formatDuration(
        new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime(),
      )
    : lastSeen(incident.started_at);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-4 py-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="mt-0.5 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
            style={{
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              color,
            }}
          >
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                to="/$wid/monitors/$mid"
                params={{ wid, mid: incident.monitor_slug || incident.monitor_id }}
                className="truncate text-[14px] text-[var(--color-fg)] no-underline hover:text-[var(--color-link)] font-medium"
              >
                {incident.monitor_name}
              </Link>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] font-semibold"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                }}
              >
                {incident.severity}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-fg-muted)]">
              <span className="mono">{incident.monitor_kind}</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {open ? `open for ${duration}` : `lasted ${duration}`}
              </span>
              <span>
                {open
                  ? `last seen ${lastSeen(incident.last_seen_at)}`
                  : `resolved ${lastSeen(incident.resolved_at)}`}
              </span>
            </div>
            {incident.error_message && (
              <div className="mt-2 mono text-[11px] text-[var(--color-fg-dim)] truncate max-w-[720px]">
                {incident.error_message}
              </div>
            )}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize",
            open
              ? "text-[var(--color-err)] bg-[color-mix(in_srgb,var(--color-err)_10%,transparent)]"
              : "text-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)]",
          )}
        >
          {incident.status}
        </span>
      </div>
    </div>
  );
}

function severityColor(severity: IncidentSeverity) {
  if (severity === "down") return "var(--color-err)";
  if (severity === "degraded") return "var(--color-warn)";
  return "var(--color-unknown)";
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
