import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  ExternalLink,
  Globe,
  KeyRound,
  Lock,
  MapPin,
  Plus,
  Rocket,
  RotateCcw,
  ScrollText,
  Server,
  Square,
  Terminal,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Segmented } from "../components/Segmented";
import { StatTile } from "../components/StatTile";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED } from "#/lib/features";
import {
  DEPLOY_STATUS_COLOR,
  DEPLOY_STATUS_LABEL,
  deployStatusActive,
  deployStatusPending,
  lastSeen,
} from "#/lib/status";
import { toast } from "#/lib/toast";
import {
  deployAccessQuery,
  useCreateDeployCredential,
  useCreateDeployService,
  useCreateDeployment,
  useDeployAccess,
  useDeployCredentials,
  useDeployEvents,
  useDeployLogs,
  useDeployMetrics,
  useDeployServices,
  useDeployments,
  useRequestDeployAccess,
  useRollbackDeployment,
  useStopDeployService,
} from "../lib/queries";
import type {
  DeployAccessStatus,
  Deployment,
  DeployRegistryCredential,
  DeployRegistryKind,
  DeployService,
  DeployStatus,
} from "../lib/types";

type DetailTab = "deployments" | "events" | "logs" | "metrics";

const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

export const Route = createFileRoute("/_authed/$wid/deployments")({
  staticData: {
    title: "Deployments",
    description: "Private-preview Docker services with Fly-backed runtime, logs, and metrics.",
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploymentsIndexPage,
});

function DeploymentsIndexPage() {
  const { wid } = Route.useParams();
  return <DeploymentsRoute wid={wid} />;
}

export function DeploymentsRoute({ wid, serviceId }: { wid: string; serviceId?: string }) {
  if (!DEPLOYMENTS_ENABLED) {
    return (
      <EmptyState
        icon={Lock}
        title="Deployments not available"
        description="Docker deployments are not enabled in this build."
      />
    );
  }

  return <DeploymentsContent wid={wid} selectedServiceId={serviceId ?? null} />;
}

function DeploymentsContent({
  wid,
  selectedServiceId,
}: {
  wid: string;
  selectedServiceId: string | null;
}) {
  const navigate = useNavigate();
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const services = useDeployServices(wid, approved);
  const credentials = useDeployCredentials(wid, approved);
  const createService = useCreateDeployService(wid);
  const createCredential = useCreateDeployCredential(wid);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);

  const sorted = useMemo(
    () => [...(services.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [services.data],
  );
  const selected = selectedServiceId
    ? (sorted.find((service) => service.id === selectedServiceId) ?? null)
    : null;
  const isDetailView = selectedServiceId != null;

  return (
    <>
      {!isDetailView && (
        <PageActions>
          <div className="flex flex-wrap items-center gap-2">
            {approved && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCredentialOpen(true)}
                >
                  <KeyRound size={14} /> Registry credential
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setServiceOpen(true)}
                >
                  <Plus size={14} /> New service
                </Button>
              </>
            )}
          </div>
        </PageActions>
      )}

      <div className={cn("relative", isDetailView && "fade-in mx-auto max-w-5xl px-6 py-7 lg:px-8")}>
        <div
          className={cn(
            "transition-opacity",
            !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
          )}
          aria-hidden={!approved}
        >
          {!approved || services.isLoading ? (
            isDetailView ? (
              <ServiceDetailSkeleton />
            ) : (
              <ServiceGridSkeleton />
            )
          ) : isDetailView ? (
            selected ? (
              <ServiceDetailPage wid={wid} service={selected} />
            ) : (
              <ServiceNotFound wid={wid} />
            )
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="No deployment services"
              description="Create an HTTP service from a Docker image to start deploying."
              action={
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setServiceOpen(true)}
                >
                  <Plus size={14} /> New service
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((service) => (
                <ServiceCard key={service.id} wid={wid} service={service} />
              ))}
            </div>
          )}
        </div>

        {access.isSuccess && !approved && (
          <RequestAccessOverlay wid={wid} status={access.data.status} />
        )}
      </div>

      <CreateCredentialDialog
        open={credentialOpen}
        pending={createCredential.isPending}
        onOpenChange={(open) => {
          if (!open && createCredential.isPending) return;
          setCredentialOpen(open);
        }}
        onSubmit={(body) =>
          createCredential.mutate(body, {
            onSuccess: () => {
              toast.success("Registry credential saved");
              setCredentialOpen(false);
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />

      <CreateServiceDialog
        open={serviceOpen}
        credentials={credentials.data ?? []}
        pending={createService.isPending}
        onOpenChange={(open) => {
          if (!open && createService.isPending) return;
          setServiceOpen(open);
        }}
        onSubmit={(body) =>
          createService.mutate(body, {
            onSuccess: (service) => {
              toast.success("Service created");
              setServiceOpen(false);
              void navigate({
                to: "/$wid/deployments/$serviceId",
                params: { wid, serviceId: service.id },
              });
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />
    </>
  );
}

function RequestAccessOverlay({ wid, status }: { wid: string; status: DeployAccessStatus }) {
  const request = useRequestDeployAccess(wid);
  const pending = status === "pending";
  const denied = status === "denied";
  const disabled = status === "disabled";

  const title = disabled
    ? "Deployments disabled"
    : pending
      ? "Access requested"
      : "Deployments private preview";
  const description = disabled
    ? "Deployments are disabled on this Produktive deployment."
    : pending
      ? "Your request is in review. Deployments unlock for this workspace once approved."
      : denied
        ? "Your previous request was declined. You can submit a new request for review."
        : "Request access to deploy HTTP services from Docker images.";

  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-10 sm:pt-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6 text-center shadow-[var(--shadow-pop)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
          <Lock size={18} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--color-fg)]">{title}</h2>
        <p className="mt-2 text-[13px] leading-5 text-[var(--color-fg-muted)]">{description}</p>
        <div className="mt-5">
          {pending || disabled ? (
            <Button type="button" variant="secondary" size="sm" disabled>
              {disabled ? "Unavailable" : "Request pending"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={request.isPending}
              onClick={() =>
                request.mutate(undefined, {
                  onSuccess: () => toast.success("Access requested"),
                  onError: (err) => toast.error((err as Error).message),
                })
              }
            >
              {request.isPending && <Spinner className="size-3" />}
              Request access
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceNotFound({ wid }: { wid: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <EmptyState
        icon={Server}
        title="Service not found"
        description="This deployment service does not exist in this workspace."
      />
      <Link
        to="/$wid/deployments"
        params={{ wid }}
        className="text-[13px] text-[var(--color-link)] no-underline hover:underline"
      >
        Back to deployments
      </Link>
    </div>
  );
}

function ServiceCard({ wid, service }: { wid: string; service: DeployService }) {
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const pending = deployStatusPending(service.status);

  return (
    <Link
      to="/$wid/deployments/$serviceId"
      params={{ wid, serviceId: service.id }}
      className="group flex min-h-44 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-left no-underline shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-row)]"
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  active && "pulse-dot",
                  pending && "animate-pulse",
                )}
                style={{
                  background: color,
                  boxShadow: active
                    ? `0 0 10px color-mix(in srgb, ${color} 55%, transparent)`
                    : undefined,
                }}
              />
              <h2 className="truncate text-[15px] font-medium text-[var(--color-fg)]">
                {service.name}
              </h2>
            </div>
            <div className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
              {service.image}
            </div>
          </div>
          <StatusBadge status={service.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <MetaChip icon={MapPin} label={service.region} />
          <MetaChip label={service.environment} />
          <MetaChip label={`:${service.internal_port}`} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <CardMetric label="Preset" value={service.resource_preset} />
        <CardMetric
          label="Health"
          value={service.health_check_path}
          mono
        />
        <div className="col-span-2 truncate text-[11px] text-[var(--color-fg-muted)]">
          {service.url
            ? service.url.replace(/^https?:\/\//, "")
            : `updated ${lastSeen(service.updated_at)}`}
        </div>
      </div>
    </Link>
  );
}

function ServiceDetailPage({ wid, service }: { wid: string; service: DeployService }) {
  const [tab, setTab] = useState<DetailTab>("deployments");
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);

  return (
    <>
      <Link
        to="/$wid/deployments"
        params={{ wid }}
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)]"
      >
        <ArrowLeft size={12} /> All services
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                active && "pulse-dot",
              )}
              style={{
                background: color,
                boxShadow: active
                  ? `0 0 12px color-mix(in srgb, ${color} 60%, transparent)`
                  : undefined,
              }}
            />
            <h1 className="truncate text-[23px] font-medium tracking-tight text-[var(--color-fg)]">
              {service.name}
            </h1>
            <StatusBadge status={service.status} />
          </div>
          <div className="mono mt-2 truncate text-[12px] text-[var(--color-fg-muted)]">
            {service.image}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={12} className="text-[var(--color-fg-dim)]" /> {service.region}
            </span>
            <span>{service.environment}</span>
            <span className="mono">:{service.internal_port}</span>
            <span>{service.resource_preset}</span>
            {service.url && (
              <span className="inline-flex items-center gap-1.5">
                <Globe size={12} className="text-[var(--color-fg-dim)]" />
                {service.url.replace(/^https?:\/\//, "")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {service.url && (
            <Button
              render={<a href={service.url} target="_blank" rel="noreferrer" />}
              variant="secondary"
              size="sm"
            >
              <ExternalLink size={13} /> Open
            </Button>
          )}
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={createDeployment.isPending}
            onClick={() =>
              createDeployment.mutate(
                { serviceId: service.id },
                {
                  onSuccess: () => toast.success("Deployment queued"),
                  onError: (err) => toast.error((err as Error).message),
                },
              )
            }
          >
            {createDeployment.isPending && <Spinner className="size-3" />}
            <Rocket size={13} /> Deploy
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={rollback.isPending}
            onClick={() =>
              rollback.mutate(service.id, {
                onSuccess: () => toast.success("Rollback queued"),
                onError: (err) => toast.error((err as Error).message),
              })
            }
          >
            <RotateCcw size={13} /> Rollback
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={stop.isPending}
            onClick={() =>
              stop.mutate(service.id, {
                onSuccess: () => toast.success("Service stop requested"),
                onError: (err) => toast.error((err as Error).message),
              })
            }
          >
            <Square size={13} /> Stop
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "deployments", label: "Deployments", icon: Rocket },
            { value: "events", label: "Events", icon: ScrollText },
            { value: "logs", label: "Logs", icon: Terminal },
            { value: "metrics", label: "Metrics", icon: Activity },
          ]}
        />
        <span className="mono text-[11px] text-[var(--color-fg-dim)]">
          {service.provider_service_id ?? service.slug}
        </span>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
        <div className="min-h-[360px] p-4">
          {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
          {tab === "events" && <EventsPanel wid={wid} service={service} />}
          {tab === "logs" && <LogsPanel wid={wid} service={service} />}
          {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
        </div>
      </div>
    </>
  );
}

function DeploymentsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const deployments = useDeployments(wid, service.id);
  if (deployments.isLoading) return <PanelLoading label="Loading deployments…" />;
  if (!deployments.data?.length) {
    return (
      <PanelEmpty
        icon={Rocket}
        label="No deployments yet"
        hint="Deploy pushes the current image and starts a new release."
      />
    );
  }
  return (
    <div className="space-y-2">
      {deployments.data.map((deployment) => (
        <DeploymentRow key={deployment.id} deployment={deployment} />
      ))}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const color = DEPLOY_STATUS_COLOR[deployment.status];
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mono truncate text-[12px] text-[var(--color-fg)]">{deployment.image}</div>
          {deployment.image_digest && (
            <div className="mono mt-0.5 truncate text-[10px] text-[var(--color-fg-dim)]">
              {deployment.image_digest.slice(0, 19)}…
            </div>
          )}
        </div>
        <StatusBadge status={deployment.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
        <span>queued {lastSeen(deployment.created_at)}</span>
        {deployment.started_at && <span>started {lastSeen(deployment.started_at)}</span>}
        {deployment.finished_at && <span>finished {lastSeen(deployment.finished_at)}</span>}
      </div>
      {deployment.failure_message && (
        <p className="mt-2 text-[12px] leading-5 text-[var(--color-err)]">
          {deployment.failure_message}
        </p>
      )}
    </div>
  );
}

function EventsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const events = useDeployEvents(wid, service.id);
  if (events.isLoading) return <PanelLoading label="Loading events…" />;
  if (!events.data?.length) {
    return (
      <PanelEmpty icon={ScrollText} label="No events yet" hint="Lifecycle events appear here." />
    );
  }
  return (
    <LogStream>
      {events.data.map((event) => (
        <LogLine
          key={event.id}
          level={event.level}
          message={event.message}
          timestamp={event.created_at}
        />
      ))}
    </LogStream>
  );
}

function LogsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const logs = useDeployLogs(wid, service.id);
  if (logs.isLoading) return <PanelLoading label="Loading logs…" />;
  if (!logs.data?.length) {
    return (
      <PanelEmpty
        icon={Terminal}
        label="No logs ingested yet"
        hint="Runtime logs from the service will stream here."
      />
    );
  }
  return (
    <LogStream>
      {logs.data.map((line, index) => (
        <LogLine
          key={`${line.timestamp}-${index}`}
          level={line.level}
          message={line.message}
          timestamp={line.timestamp}
        />
      ))}
    </LogStream>
  );
}

function MetricsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const metrics = useDeployMetrics(wid, service.id);
  if (metrics.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <StatTile key={index} label="Loading" value="—" loading />
        ))}
      </div>
    );
  }
  if (!metrics.data?.length) {
    return (
      <PanelEmpty
        icon={Activity}
        label="No metrics collected yet"
        hint="CPU, memory, and request counts appear after the service is live."
      />
    );
  }
  const latest = metrics.data[metrics.data.length - 1];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile
        label="CPU"
        value={latest.cpu_percent == null ? "—" : `${latest.cpu_percent.toFixed(1)}%`}
        accent={
          latest.cpu_percent != null && latest.cpu_percent >= 80
            ? "var(--color-warn)"
            : undefined
        }
        sub={`bucket ${lastSeen(latest.bucket_start)}`}
      />
      <StatTile
        label="Memory"
        value={latest.memory_mb == null ? "—" : `${latest.memory_mb.toFixed(0)} MB`}
        sub={`bucket ${lastSeen(latest.bucket_start)}`}
      />
      <StatTile
        label="Requests"
        value={latest.requests == null ? "—" : latest.requests.toFixed(0)}
        sub={`${metrics.data.length} buckets`}
      />
    </div>
  );
}

function LogStream({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)]">
      <ScrollArea className="h-[360px]">
        <div className="mono space-y-0 p-3 text-[11px] leading-5">{children}</div>
      </ScrollArea>
    </div>
  );
}

function LogLine({
  level,
  message,
  timestamp,
}: {
  level: string;
  message: string;
  timestamp: string;
}) {
  const levelColor =
    level === "error" || level === "fatal"
      ? "var(--color-err)"
      : level === "warn"
        ? "var(--color-warn)"
        : "var(--color-fg-dim)";

  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-12 shrink-0 text-[var(--color-fg-dim)]">{lastSeen(timestamp)}</span>
      <span className="w-12 shrink-0 uppercase" style={{ color: levelColor }}>
        {level}
      </span>
      <span className="min-w-0 text-[var(--color-fg-muted)]">{message}</span>
    </div>
  );
}

function MetaChip({
  icon: Icon,
  label,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-fg-dim)]">
      {Icon && <Icon size={10} />}
      {label}
    </span>
  );
}

function CardMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-[15px] font-medium text-[var(--color-fg)]",
          mono && "mono text-[12px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CreateCredentialDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    registry_kind: DeployRegistryKind;
    username: string;
    password: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ name, registry_kind: registryKind, username, password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Registry credential"
        description="Credentials are encrypted before they are stored."
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="deploy-credential-form"
              variant="default"
              disabled={pending}
            >
              {pending && <Spinner className="size-3" />} Save credential
            </Button>
          </>
        }
      >
        <form id="deploy-credential-form" onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Registry">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={registryKind}
              onChange={(e) => setRegistryKind(e.target.value as DeployRegistryKind)}
            >
              <option value="ghcr">GitHub Container Registry</option>
              <option value="docker_hub">Docker Hub</option>
            </select>
          </Field>
          <Field label="Username">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label="Token / password">
            <input
              type="password"
              className={cn(fieldControlClass, "h-9")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateServiceDialog({
  open,
  credentials,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  credentials: DeployRegistryCredential[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    image: string;
    registry_kind: DeployRegistryKind;
    registry_credential_id?: string | null;
    internal_port: number;
    env: Record<string, string>;
    secrets: Record<string, string>;
    environment: string;
    health_check_path: string;
    region: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [credentialId, setCredentialId] = useState("");
  const [port, setPort] = useState(3000);
  const [environment, setEnvironment] = useState("production");
  const [region, setRegion] = useState("fra");
  const [health, setHealth] = useState("/");
  const [envText, setEnvText] = useState("");
  const [secretText, setSecretText] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSubmit({
        name,
        image,
        registry_kind: registryKind,
        registry_credential_id: credentialId || null,
        internal_port: port,
        env: parseKeyValues(envText),
        secrets: parseKeyValues(secretText),
        environment,
        health_check_path: health,
        region,
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New deployment service"
        description="HTTP-only, stateless containers with the preview small resource preset."
        size="lg"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" form="deploy-service-form" variant="default" disabled={pending}>
              {pending && <Spinner className="size-3" />} Create service
            </Button>
          </>
        }
      >
        <form id="deploy-service-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Image">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="ghcr.io/acme/api:latest"
              required
            />
          </Field>
          <Field label="Registry">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={registryKind}
              onChange={(e) => setRegistryKind(e.target.value as DeployRegistryKind)}
            >
              <option value="ghcr">GHCR</option>
              <option value="docker_hub">Docker Hub</option>
            </select>
          </Field>
          <Field label="Credential">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
            >
              <option value="">No credential</option>
              {credentials.map((credential) => (
                <option key={credential.id} value={credential.id}>
                  {credential.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Port">
            <input
              type="number"
              min={1}
              max={65535}
              className={cn(fieldControlClass, "h-9")}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
            />
          </Field>
          <Field label="Region">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              required
            />
          </Field>
          <Field label="Environment">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              required
            />
          </Field>
          <Field label="Health path">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={health}
              onChange={(e) => setHealth(e.target.value)}
              required
            />
          </Field>
          <Field label="Env vars">
            <textarea
              className={cn(fieldControlClass, "min-h-24 resize-y py-2")}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={"LOG_LEVEL=info"}
            />
          </Field>
          <Field label="Secrets">
            <textarea
              className={cn(fieldControlClass, "min-h-24 resize-y py-2")}
              value={secretText}
              onChange={(e) => setSecretText(e.target.value)}
              placeholder={"DATABASE_URL=postgres://..."}
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

function StatusBadge({ status }: { status: DeployStatus }) {
  const color = DEPLOY_STATUS_COLOR[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {DEPLOY_STATUS_LABEL[status]}
    </span>
  );
}

function ServiceGridSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-44 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)]"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Skeleton className="h-14 rounded-[var(--radius-md)]" />
            <Skeleton className="h-14 rounded-[var(--radius-md)]" />
            <Skeleton className="col-span-2 h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-[360px] w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
      <Spinner className="size-4" /> <span className="ml-2">{label}</span>
    </div>
  );
}

function PanelEmpty({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Rocket;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
        <Icon size={16} />
      </div>
      <p className="text-[13px] font-medium text-[var(--color-fg)]">{label}</p>
      {hint && <p className="max-w-sm text-[12px] leading-5 text-[var(--color-fg-muted)]">{hint}</p>}
    </div>
  );
}

function parseKeyValues(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) throw new Error(`Invalid KEY=value line: ${trimmed}`);
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1);
  }
  return out;
}
