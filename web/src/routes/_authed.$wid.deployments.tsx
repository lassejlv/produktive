import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ExternalLink,
  KeyRound,
  Lock,
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
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED } from "#/lib/features";
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
import { lastSeen } from "../lib/status";
import type {
  DeployAccessStatus,
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
  component: DeploymentsPage,
});

function DeploymentsPage() {
  const { wid } = Route.useParams();

  if (!DEPLOYMENTS_ENABLED) {
    return (
      <EmptyState
        icon={Lock}
        title="Deployments not available"
        description="Docker deployments are not enabled in this build."
      />
    );
  }

  return <DeploymentsContent wid={wid} />;
}

function DeploymentsContent({ wid }: { wid: string }) {
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const services = useDeployServices(wid, approved);
  const credentials = useDeployCredentials(wid, approved);
  const createService = useCreateDeployService(wid);
  const createCredential = useCreateDeployCredential(wid);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...(services.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [services.data],
  );
  const selected = sorted.find((service) => service.id === selectedId) ?? sorted[0] ?? null;

  return (
    <>
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

      <div className="relative">
        <div
          className={cn(
            "transition-opacity",
            !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
          )}
          aria-hidden={!approved}
        >
          {!approved || services.isLoading ? (
            <ServiceGridSkeleton />
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
            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.2fr)]">
              <div className="space-y-3">
                {sorted.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    selected={service.id === selected?.id}
                    onSelect={() => setSelectedId(service.id)}
                  />
                ))}
              </div>
              {selected && <ServiceDetails wid={wid} service={selected} />}
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
              setSelectedId(service.id);
              setServiceOpen(false);
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

function ServiceCard({
  service,
  selected,
  onSelect,
}: {
  service: DeployService;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[var(--radius-lg)] border bg-[var(--color-bg-elev)] p-4 text-left shadow-[var(--shadow-sm)] transition-colors",
        selected
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-[var(--color-fg-muted)]" />
            <span className="truncate text-[14px] font-medium text-[var(--color-fg)]">
              {service.name}
            </span>
          </div>
          <div className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
            {service.image}
          </div>
        </div>
        <StatusBadge status={service.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
        <span>{service.environment}</span>
        <span>{service.region}</span>
        <span>:{service.internal_port}</span>
        {service.url && <span className="truncate">{service.url.replace(/^https?:\/\//, "")}</span>}
      </div>
    </button>
  );
}

function ServiceDetails({ wid, service }: { wid: string; service: DeployService }) {
  const [tab, setTab] = useState<DetailTab>("deployments");
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-medium text-[var(--color-fg)]">
              {service.name}
            </h2>
            <StatusBadge status={service.status} />
          </div>
          <div className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
            {service.provider_service_id ?? service.slug}
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

      <div className="border-b border-[var(--color-border)] px-3 pt-2">
        <div className="flex gap-1">
          {[
            ["deployments", Rocket],
            ["events", ScrollText],
            ["logs", Terminal],
            ["metrics", Activity],
          ].map(([value, Icon]) => (
            <Button
              key={value as string}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTab(value as DetailTab)}
              className={cn(
                "rounded-b-none capitalize",
                tab === value && "bg-[var(--color-bg-row)] text-[var(--color-fg)]",
              )}
            >
              <Icon size={13} /> {value as string}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-[280px] p-4">
        {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
        {tab === "events" && <EventsPanel wid={wid} service={service} />}
        {tab === "logs" && <LogsPanel wid={wid} service={service} />}
        {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
      </div>
    </div>
  );
}

function DeploymentsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const deployments = useDeployments(wid, service.id);
  if (deployments.isLoading) return <PanelLoading label="loading deployments..." />;
  if (!deployments.data?.length) return <PanelEmpty label="No deployments queued yet." />;
  return (
    <div className="space-y-2">
      {deployments.data.map((deployment) => (
        <div
          key={deployment.id}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="mono truncate text-[12px] text-[var(--color-fg)]">
              {deployment.image}
            </div>
            <StatusBadge status={deployment.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--color-fg-muted)]">
            <span>queued {lastSeen(deployment.created_at)}</span>
            {deployment.started_at && <span>started {lastSeen(deployment.started_at)}</span>}
            {deployment.failure_message && (
              <span className="text-[var(--color-err)]">{deployment.failure_message}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const events = useDeployEvents(wid, service.id);
  if (events.isLoading) return <PanelLoading label="loading events..." />;
  if (!events.data?.length) return <PanelEmpty label="No events yet." />;
  return (
    <div className="space-y-2">
      {events.data.map((event) => (
        <LogRow
          key={event.id}
          level={event.level}
          message={event.message}
          timestamp={event.created_at}
        />
      ))}
    </div>
  );
}

function LogsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const logs = useDeployLogs(wid, service.id);
  if (logs.isLoading) return <PanelLoading label="loading logs..." />;
  if (!logs.data?.length) return <PanelEmpty label="No logs ingested yet." />;
  return (
    <div className="space-y-2">
      {logs.data.map((line, index) => (
        <LogRow
          key={`${line.timestamp}-${index}`}
          level={line.level}
          message={line.message}
          timestamp={line.timestamp}
        />
      ))}
    </div>
  );
}

function MetricsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const metrics = useDeployMetrics(wid, service.id);
  if (metrics.isLoading) return <PanelLoading label="loading metrics..." />;
  if (!metrics.data?.length) return <PanelEmpty label="No metrics collected yet." />;
  const latest = metrics.data[metrics.data.length - 1];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricTile
        label="CPU"
        value={latest.cpu_percent == null ? "-" : `${latest.cpu_percent.toFixed(1)}%`}
      />
      <MetricTile
        label="Memory"
        value={latest.memory_mb == null ? "-" : `${latest.memory_mb.toFixed(0)} MB`}
      />
      <MetricTile
        label="Requests"
        value={latest.requests == null ? "-" : latest.requests.toFixed(0)}
      />
    </div>
  );
}

function LogRow({
  level,
  message,
  timestamp,
}: {
  level: string;
  message: string;
  timestamp: string;
}) {
  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2 text-[12px] sm:grid-cols-[90px_1fr_120px]">
      <span className="mono uppercase text-[var(--color-fg-dim)]">{level}</span>
      <span className="text-[var(--color-fg-muted)]">{message}</span>
      <span className="text-right text-[var(--color-fg-dim)]">{lastSeen(timestamp)}</span>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[22px] font-medium text-[var(--color-fg)]">{value}</div>
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
  const color =
    status === "live" || status === "healthy"
      ? "var(--color-ok)"
      : status === "failed"
        ? "var(--color-err)"
        : status === "stopped"
          ? "var(--color-fg-muted)"
          : "var(--color-warn)";
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function ServiceGridSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="shimmer h-32 rounded-[var(--radius-lg)]" />
      ))}
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
      <Spinner className="size-4" /> <span className="ml-2">{label}</span>
    </div>
  );
}

function PanelEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-[13px] text-[var(--color-fg-muted)]">
      {label}
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
