import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "#/lib/toast";
import { cn } from "#/lib/cn";
import {
  fmtIncidentDateTime,
  formatIncidentDuration,
  incidentHeading,
  severityColor,
  severityLabel,
  updateStatusLabel,
} from "#/lib/incidents";
import { lastSeen } from "#/lib/status";
import { useAddIncidentUpdate } from "#/lib/queries";
import type { Incident, IncidentUpdateStatus } from "#/lib/types";
import { Dialog, DialogClose, DialogContent } from "../Dialog";
import { PageActions } from "../PageLayout";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";

const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

export function WorkspaceIncidentDetail({ wid, incident }: { wid: string; incident: Incident }) {
  const open = incident.status === "open";
  const color = severityColor(incident.severity);
  const heading = incidentHeading(incident);
  const resolvedAt = incident.resolved_at ?? incident.last_seen_at;
  const duration = formatIncidentDuration(
    new Date(resolvedAt).getTime() - new Date(incident.started_at).getTime(),
  );
  const updates = [...incident.updates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const addUpdate = useAddIncidentUpdate(wid);
  const [updateTarget, setUpdateTarget] = useState<{
    status: Exclude<IncidentUpdateStatus, "unknown">;
  } | null>(null);

  return (
    <>
      {open && (
        <PageActions>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setUpdateTarget({ status: "monitoring" })}
            >
              <MessageSquare size={13} /> Post update
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setUpdateTarget({ status: "resolved" })}
            >
              Resolve
            </Button>
          </div>
        </PageActions>
      )}

      <div className="mx-auto w-full max-w-3xl px-6 pb-10 pt-2">
        <Link
          to="/$wid/incidents"
          params={{ wid }}
          className="mb-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={13} />
          Back to incidents
        </Link>

        <div className="flex items-start gap-3">
          <span
            className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: open ? color : "var(--color-ok)" }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-medium leading-tight tracking-tight text-[var(--color-fg)]">
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
              {incident.source === "manual" && (
                <span className="rounded-full bg-[var(--color-bg-row)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                  manual
                </span>
              )}
              <span className={open ? "text-[var(--color-err)]" : "text-[var(--color-ok)]"}>
                {open ? "Open" : "Resolved"}
              </span>
              <span>Started {fmtIncidentDateTime(incident.started_at)}</span>
              {!open && (
                <span>
                  Resolved {fmtIncidentDateTime(resolvedAt)} · lasted {duration}
                </span>
              )}
              {open && <span>Last seen {lastSeen(incident.last_seen_at)}</span>}
            </div>

            {incident.monitor_id && (
              <div className="mt-3 text-[13px] text-[var(--color-fg-muted)]">
                Monitor{" "}
                <Link
                  to="/$wid/monitors/$mid"
                  params={{ wid, mid: incident.monitor_slug || incident.monitor_id }}
                  className="font-medium text-[var(--color-link)] no-underline hover:underline"
                >
                  {incident.monitor_name ?? incident.title}
                </Link>
              </div>
            )}

            {incident.error_message && (
              <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2.5 text-[13px] text-[var(--color-fg-muted)]">
                {incident.error_message}
              </div>
            )}
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
            Updates
          </h2>
          {updates.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-8 text-center text-[13px] text-[var(--color-fg-muted)] shadow-[var(--shadow-xs)]">
              No updates have been posted for this incident.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
              {updates.map((update, i) => (
                <div
                  key={update.id}
                  className={
                    i > 0 ? "border-t border-[var(--color-border)] px-4 py-4" : "px-4 py-4"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-medium capitalize text-[var(--color-fg)]">
                      {updateStatusLabel(update.status)}
                    </span>
                    <span className="text-[var(--color-fg-dim)]">{lastSeen(update.created_at)}</span>
                    <span className="text-[var(--color-fg-dim)]">·</span>
                    <span className="text-[var(--color-fg-dim)]">
                      {fmtIncidentDateTime(update.created_at)}
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
      </div>

      <IncidentUpdateDialog
        incident={incident}
        target={updateTarget}
        pending={addUpdate.isPending}
        onOpenChange={(next) => {
          if (!next && addUpdate.isPending) return;
          if (!next) setUpdateTarget(null);
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

function IncidentUpdateDialog({
  incident,
  target,
  pending,
  onOpenChange,
  onSubmit,
}: {
  incident: Incident;
  target: { status: Exclude<IncidentUpdateStatus, "unknown"> } | null;
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
    onSubmit({ incidentId: incident.id, status, message });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={status === "resolved" ? "Resolve incident" : "Post incident update"}
        description={incident.title}
        size="lg"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" form="incident-update-form" variant="default" disabled={pending}>
              {pending && <Spinner className="size-3" />}
              {status === "resolved" ? "Resolve incident" : "Post update"}
            </Button>
          </>
        }
      >
        <form id="incident-update-form" onSubmit={submit} className="space-y-4">
          <Field label="Status">
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as Exclude<IncidentUpdateStatus, "unknown">)
              }
            >
              <SelectTrigger className={cn(fieldControlClass, "h-9")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="identified">Identified</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
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
