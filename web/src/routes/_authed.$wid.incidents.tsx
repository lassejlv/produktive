import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, Plus, ScrollText } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "../components/Spinner";
import {
  incidentsQuery,
  useAddIncidentUpdate,
  useCreateIncident,
  useIncidents,
  useMonitors,
} from "../lib/queries";
import type { Incident, IncidentSeverity, IncidentUpdateStatus, Monitor } from "../lib/types";
import { lastSeen } from "../lib/status";
import { cn } from "#/lib/cn";

type Filter = "open" | "all" | "resolved";
type ManualIncidentSeverity = Exclude<IncidentSeverity, "unknown">;

const SEVERITY_OPTIONS: Array<{ value: ManualIncidentSeverity; label: string }> = [
  { value: "informational", label: "Informational" },
  { value: "maintenance", label: "Maintenance" },
  { value: "minor", label: "Minor impact" },
  { value: "degraded", label: "Degraded" },
  { value: "down", label: "Down" },
  { value: "critical", label: "Critical" },
];

const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

export const Route = createFileRoute("/_authed/$wid/incidents")({
  staticData: {
    title: "Incidents",
    description: "Private incident history, manual incident updates, and monitor state changes.",
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(incidentsQuery(params.wid, "open")),
  component: IncidentsPage,
});

function IncidentsPage() {
  const { wid } = Route.useParams();
  const [filter, setFilter] = useState<Filter>("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<{
    incident: Incident;
    status: Exclude<IncidentUpdateStatus, "unknown">;
  } | null>(null);
  const { data: incidents = [], isLoading } = useIncidents(wid, filter);
  const { data: monitors = [] } = useMonitors(wid);
  const createIncident = useCreateIncident(wid);
  const addUpdate = useAddIncidentUpdate(wid);

  return (
    <>
      <PageActions>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Open incident
          </Button>
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
          description="Incidents can be opened manually or created automatically when a monitor becomes degraded or down."
        />
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              wid={wid}
              incident={incident}
              onUpdate={() => setUpdateTarget({ incident, status: "monitoring" })}
              onResolve={() => setUpdateTarget({ incident, status: "resolved" })}
            />
          ))}
        </div>
      )}

      <CreateIncidentDialog
        open={createOpen}
        monitors={monitors}
        pending={createIncident.isPending}
        onOpenChange={(open) => {
          if (!open && createIncident.isPending) return;
          setCreateOpen(open);
        }}
        onSubmit={(body) => {
          createIncident.mutate(body, {
            onSuccess: () => {
              setCreateOpen(false);
              setFilter("open");
              toast.success("Incident opened");
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />

      <IncidentUpdateDialog
        target={updateTarget}
        pending={addUpdate.isPending}
        onOpenChange={(open) => {
          if (!open && addUpdate.isPending) return;
          if (!open) setUpdateTarget(null);
        }}
        onSubmit={(body) => {
          addUpdate.mutate(body, {
            onSuccess: () => {
              setUpdateTarget(null);
              toast.success(body.status === "resolved" ? "Incident resolved" : "Update posted");
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />
    </>
  );
}

function IncidentRow({
  wid,
  incident,
  onUpdate,
  onResolve,
}: {
  wid: string;
  incident: Incident;
  onUpdate: () => void;
  onResolve: () => void;
}) {
  const open = incident.status === "open";
  const color = severityColor(incident.severity);
  const Icon = open ? AlertTriangle : CheckCircle2;
  const duration = incident.resolved_at
    ? formatDuration(
        new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime(),
      )
    : lastSeen(incident.started_at);
  const isManual = incident.source === "manual";

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
              {incident.monitor_id ? (
                <Link
                  to="/$wid/monitors/$mid"
                  params={{ wid, mid: incident.monitor_slug || incident.monitor_id }}
                  className="truncate text-[14px] text-[var(--color-fg)] no-underline hover:text-[var(--color-link)] font-medium"
                >
                  {incident.title || incident.monitor_name}
                </Link>
              ) : (
                <span className="truncate text-[14px] font-medium text-[var(--color-fg)]">
                  {incident.title}
                </span>
              )}
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] font-semibold"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                }}
              >
                {severityLabel(incident.severity)}
              </span>
              {isManual && (
                <span className="shrink-0 rounded-full bg-[var(--color-bg-row)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                  manual
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-fg-muted)]">
              <span className="mono">{incident.monitor_kind ?? "status page"}</span>
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
              <div className="mt-2 text-[12px] text-[var(--color-fg-muted)] max-w-[720px]">
                {incident.error_message}
              </div>
            )}
            {incident.updates.length > 0 && (
              <div className="mt-3 space-y-2">
                {incident.updates.map((update) => (
                  <div
                    key={update.id}
                    className="border-l border-[var(--color-border-hi)] pl-3 text-[12px]"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[var(--color-fg-dim)]">
                      <span className="font-medium capitalize text-[var(--color-fg-muted)]">
                        {update.status.replace("_", " ")}
                      </span>
                      <span>{lastSeen(update.created_at)}</span>
                    </div>
                    <div className="mt-0.5 text-[var(--color-fg-muted)]">{update.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize",
              open
                ? "text-[var(--color-err)] bg-[color-mix(in_srgb,var(--color-err)_10%,transparent)]"
                : "text-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)]",
            )}
          >
            {incident.status}
          </span>
          {open && (
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="secondary" size="sm" onClick={onUpdate}>
                <MessageSquare size={13} /> Update
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={onResolve}>
                Resolve
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateIncidentDialog({
  open,
  monitors,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  monitors: Monitor[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    title: string;
    message: string;
    severity: ManualIncidentSeverity;
    monitor_id: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<ManualIncidentSeverity>("degraded");
  const [monitorId, setMonitorId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSeverity("degraded");
      setMonitorId("");
      setMessage("");
    }
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ title, severity, message, monitor_id: monitorId || null });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Open incident"
        description="Publish a manual incident on the status page and start its update timeline."
        size="lg"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" form="open-incident-form" variant="primary" disabled={pending}>
              {pending && <Spinner size={12} thickness={2} />}
              Open incident
            </Button>
          </>
        }
      >
        <form id="open-incident-form" onSubmit={submit} className="space-y-4">
          <Field label="Title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={cn(fieldControlClass, "h-9")}
              placeholder="Dashboard API outage"
              maxLength={160}
              required
            />
          </Field>
          <Field label="Severity">
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as ManualIncidentSeverity)}
              className={cn(fieldControlClass, "h-9")}
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Affected monitor">
            <select
              value={monitorId}
              onChange={(event) => setMonitorId(event.target.value)}
              className={cn(fieldControlClass, "h-9")}
            >
              <option value="">No specific monitor</option>
              {monitors.map((monitor) => (
                <option key={monitor.id} value={monitor.id}>
                  {monitor.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Initial update">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={cn(fieldControlClass, "min-h-28 resize-y py-2")}
              placeholder="We are investigating elevated errors and will post updates here."
              maxLength={4000}
              required
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncidentUpdateDialog({
  target,
  pending,
  onOpenChange,
  onSubmit,
}: {
  target: { incident: Incident; status: Exclude<IncidentUpdateStatus, "unknown"> } | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    incidentId: string;
    message: string;
    status: Exclude<IncidentUpdateStatus, "unknown">;
  }) => void;
}) {
  const [status, setStatus] = useState<Exclude<IncidentUpdateStatus, "unknown">>("monitoring");
  const [message, setMessage] = useState("");
  const open = target !== null;

  useEffect(() => {
    if (target) {
      setStatus(target.status);
      setMessage(target.status === "resolved" ? "The incident has been resolved." : "");
    }
  }, [target]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    onSubmit({ incidentId: target.incident.id, status, message });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={status === "resolved" ? "Resolve incident" : "Post incident update"}
        description={target?.incident.title}
        size="lg"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" form="incident-update-form" variant="primary" disabled={pending}>
              {pending && <Spinner size={12} thickness={2} />}
              {status === "resolved" ? "Resolve incident" : "Post update"}
            </Button>
          </>
        }
      >
        <form id="incident-update-form" onSubmit={submit} className="space-y-4">
          <Field label="Status">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Exclude<IncidentUpdateStatus, "unknown">)
              }
              className={cn(fieldControlClass, "h-9")}
            >
              <option value="investigating">Investigating</option>
              <option value="identified">Identified</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
            </select>
          </Field>
          <Field label="Update">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={cn(fieldControlClass, "min-h-28 resize-y py-2")}
              maxLength={4000}
              required
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{label}</span>
      {children}
    </label>
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

function severityLabel(severity: IncidentSeverity): string {
  return SEVERITY_OPTIONS.find((option) => option.value === severity)?.label ?? "Unknown";
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
