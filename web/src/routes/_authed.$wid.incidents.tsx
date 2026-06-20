import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Plus, ScrollText } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  formatIncidentDuration,
  incidentHeading,
  severityColor,
  severityLabel,
} from "#/lib/incidents";
import {
  incidentsQuery,
  useCreateIncident,
  useIncidents,
  useMonitors,
} from "../lib/queries";
import type { Incident, IncidentSeverity, Monitor } from "../lib/types";
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
  const { data: incidents = [], isLoading } = useIncidents(wid, filter);
  const { data: monitors = [] } = useMonitors(wid);
  const createIncident = useCreateIncident(wid);

  return (
    <>
      <PageActions>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-0.5">
            {(["open", "all", "resolved"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFilter(value)}
                className={cn(
                  "h-7 rounded-[var(--radius-sm)] px-2.5 text-[12px] capitalize shadow-none",
                  filter === value
                    ? "border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
                    : "border border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                )}
              >
                {value}
              </Button>
            ))}
          </div>
          <Button type="button" variant="default" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Open incident
          </Button>
        </div>
      </PageActions>

      {isLoading ? (
        <div className="flex h-[280px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
          <Spinner className="size-4" /> <span className="ml-2">loading incidents...</span>
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
            <IncidentRow key={incident.id} wid={wid} incident={incident} />
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
    </>
  );
}

function IncidentRow({ wid, incident }: { wid: string; incident: Incident }) {
  const open = incident.status === "open";
  const color = severityColor(incident.severity);
  const Icon = open ? AlertTriangle : CheckCircle2;
  const duration = incident.resolved_at
    ? formatIncidentDuration(
        new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime(),
      )
    : lastSeen(incident.started_at);
  const isManual = incident.source === "manual";
  const title = incidentHeading(incident);

  return (
    <Link
      to="/$wid/incidents/$id"
      params={{ wid, id: incident.id }}
      className="block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)] no-underline transition-colors hover:bg-[var(--color-bg-row)]"
    >
      <div className="flex items-start justify-between gap-4 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
            style={{
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              color,
            }}
          >
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[14px] font-medium text-[var(--color-fg)]">{title}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
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
              {incident.updates.length > 0 && (
                <span>
                  {incident.updates.length} update{incident.updates.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {incident.error_message && (
              <div className="mt-2 line-clamp-2 max-w-[720px] text-[12px] text-[var(--color-fg-muted)]">
                {incident.error_message}
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
          <ChevronRight size={16} className="text-[var(--color-fg-dim)]" />
        </div>
      </div>
    </Link>
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
            <Button type="submit" form="open-incident-form" variant="default" disabled={pending}>
              {pending && <Spinner className="size-3" />}
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
            <Select
              value={severity}
              onValueChange={(value) => setSeverity(value as ManualIncidentSeverity)}
            >
              <SelectTrigger className={cn(fieldControlClass, "h-9")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Affected monitor">
            <Select
              value={monitorId || "none"}
              onValueChange={(value) => setMonitorId(value === "none" || value == null ? "" : value)}
            >
              <SelectTrigger className={cn(fieldControlClass, "h-9")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific monitor</SelectItem>
                {monitors.map((monitor) => (
                  <SelectItem key={monitor.id} value={monitor.id}>
                    {monitor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{label}</span>
      {children}
    </label>
  );
}
