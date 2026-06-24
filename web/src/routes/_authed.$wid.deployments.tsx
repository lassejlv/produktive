import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  MapPin,
  MemoryStick,
  Network,
  Plus,
  Rocket,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Server,
  Settings,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChartTooltip, Grid, Line, LineChart, XAxis } from "#/charts";
import { Button } from "#/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
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
  DEPLOY_GLOW_CLASS,
  deployStatusActive,
  deployStatusPending,
  lastSeen,
} from "#/lib/status";
import { toast } from "#/lib/toast";
import {
  deployAccessQuery,
  useCreateDeployCredential,
  useCreateDeployServiceVolume,
  useCreateDeployServiceDomain,
  useCreateDeployService,
  useCreateDeployment,
  useDeleteDeployService,
  useDeleteDeployServiceVolume,
  useDeployAccess,
  useDeployCredentials,
  useDeployEvents,
  useDeployLogs,
  useDeployMetrics,
  useDeployServiceDomains,
  useDeployServiceVolumes,
  useDeployServices,
  useDeployments,
  useDeleteDeployServiceDomain,
  useRequestDeployAccess,
  useRollbackDeployment,
  useStopDeployService,
  useUpdateDeployService,
  useUpdateDeployServiceVolume,
  useVerifyDeployServiceDomain,
} from "../lib/queries";
import type {
  DeployAccessStatus,
  Deployment,
  DeployMetricPoint,
  DeployRegistryCredential,
  DeployRegistryKind,
  DeployResourcePreset,
  DeployServiceDomain,
  DeployService,
  DeployServiceVolume,
  DeployStatus,
} from "../lib/types";

type DetailTab = "deployments" | "events" | "logs" | "metrics" | "domains" | "settings";
export type DeployDetailTab = DetailTab;
type MetricChartKind = "cpu" | "memory" | "requests";
type DeployServiceFilter = "all" | "live" | "deploying" | "failed" | "stopped";

type DeploymentsSearch = {
  q?: string;
  status?: DeployServiceFilter;
};

const EMPTY_DEPLOYMENTS_SEARCH: DeploymentsSearch = { q: undefined, status: undefined };

const DEPLOY_SERVICE_FILTERS: DeployServiceFilter[] = [
  "all",
  "live",
  "deploying",
  "failed",
  "stopped",
];

function parseDeployServiceFilter(value: unknown): DeployServiceFilter | undefined {
  return typeof value === "string" && DEPLOY_SERVICE_FILTERS.includes(value as DeployServiceFilter)
    ? (value as DeployServiceFilter)
    : undefined;
}

function deployServiceFilterBucket(status: DeployStatus): DeployServiceFilter {
  if (deployStatusActive(status)) return "live";
  if (deployStatusPending(status)) return "deploying";
  if (status === "failed") return "failed";
  if (status === "stopped" || status === "rolled_back") return "stopped";
  return "all";
}

function matchesDeploySearch(service: DeployService, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    service.name.toLowerCase().includes(q) ||
    service.image.toLowerCase().includes(q) ||
    service.region.toLowerCase().includes(q) ||
    service.environment.toLowerCase().includes(q) ||
    service.slug.toLowerCase().includes(q) ||
    (service.url?.toLowerCase().includes(q) ?? false)
  );
}

const RESOURCE_PRESETS: Array<{
  value: DeployResourcePreset;
  label: string;
  detail: string;
}> = [
  { value: "preview_small", label: "Small", detail: "1 shared CPU / 512 MB" },
  { value: "preview_medium", label: "Medium", detail: "1 shared CPU / 1 GB" },
  { value: "preview_large", label: "Large", detail: "2 shared CPUs / 2 GB" },
];

const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

/** Status-tinted elevation for service surfaces — echoes the monitor-card glow language. */
function surfaceShadow(status: DeployStatus): string {
  const color = DEPLOY_STATUS_COLOR[status];
  if (status === "failed") {
    return `var(--shadow-md), 0 0 0 1px color-mix(in srgb, ${color} 16%, transparent), 0 16px 38px -18px color-mix(in srgb, ${color} 34%, transparent)`;
  }
  if (deployStatusActive(status)) {
    return `var(--shadow-sm), 0 0 0 1px color-mix(in srgb, ${color} 13%, transparent)`;
  }
  return "var(--shadow-sm)";
}

/** A live "ticking" indicator used in panel headers backed by polling queries. */
function LiveDot({ label = "Live", color = "var(--color-ok)" }: { label?: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Consistent panel chrome: a bordered surface with a hairline-separated header. */
function PanelCard({
  title,
  icon: Icon,
  count,
  live,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: typeof Rocket;
  count?: ReactNode;
  live?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--color-border)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={14} className="shrink-0 text-[var(--color-fg-muted)]" />}
          <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">{title}</span>
          {count != null && (
            <span className="tabular text-[11px] text-[var(--color-fg-dim)]">{count}</span>
          )}
          {live && <LiveDot />}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("p-3.5", bodyClassName)}>{children}</div>
    </div>
  );
}

/** A click-to-copy mono chip — used for image refs, digests, and provider ids. */
function CopyChip({
  value,
  icon: Icon,
  label,
  className,
}: {
  value: string;
  icon?: typeof Rocket;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        toast.success("Copied to clipboard");
      }}
      title="Copy"
      className={cn(
        "group/copy inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-2 py-1 text-left transition-colors hover:border-[var(--color-border-hi)] hover:bg-[var(--color-bg-sunken)]",
        className,
      )}
    >
      {Icon && <Icon size={12} className="shrink-0 text-[var(--color-fg-dim)]" />}
      <span className="mono min-w-0 truncate text-[11.5px] text-[var(--color-fg-muted)] group-hover/copy:text-[var(--color-fg)]">
        {label ?? value}
      </span>
      <Copy
        size={11}
        className="shrink-0 text-[var(--color-fg-dim)] opacity-0 transition-opacity group-hover/copy:opacity-100"
      />
    </button>
  );
}

export const Route = createFileRoute("/_authed/$wid/deployments")({
  staticData: {
    title: "Deployments",
    description: "Private-preview Docker services with Fly-backed runtime, logs, and metrics.",
  },
  validateSearch: (search: Record<string, unknown>): DeploymentsSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    status: parseDeployServiceFilter(search.status),
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploymentsIndexPage,
});

function DeploymentsIndexPage() {
  const { wid } = Route.useParams();
  const search = Route.useSearch();
  const { serviceId } = useParams({ strict: false }) as { serviceId?: string };
  return <DeploymentsRoute wid={wid} serviceId={serviceId} indexSearch={search} />;
}

export function DeploymentsRoute({
  wid,
  serviceId,
  tab,
  indexSearch,
}: {
  wid: string;
  serviceId?: string;
  tab?: DeployDetailTab;
  indexSearch?: DeploymentsSearch;
}) {
  if (!DEPLOYMENTS_ENABLED) {
    return (
      <EmptyState
        icon={Lock}
        title="Deployments not available"
        description="Docker deployments are not enabled in this build."
      />
    );
  }

  return (
    <DeploymentsContent
      wid={wid}
      selectedServiceId={serviceId ?? null}
      detailTab={tab}
      indexSearch={indexSearch}
    />
  );
}

function DeploymentsContent({
  wid,
  selectedServiceId,
  detailTab,
  indexSearch,
}: {
  wid: string;
  selectedServiceId: string | null;
  detailTab?: DeployDetailTab;
  indexSearch?: DeploymentsSearch;
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

  const filterStatus = indexSearch?.status ?? "all";
  const searchQuery = indexSearch?.q ?? "";

  const filtered = useMemo(() => {
    return sorted.filter((service) => {
      const bucket = deployServiceFilterBucket(service.status);
      const statusMatch = filterStatus === "all" || bucket === filterStatus;
      return statusMatch && matchesDeploySearch(service, searchQuery);
    });
  }, [sorted, filterStatus, searchQuery]);

  const setIndexSearch = (patch: Partial<DeploymentsSearch>) => {
    void navigate({
      to: "/$wid/deployments",
      params: { wid },
      search: {
        q: "q" in patch ? patch.q : searchQuery || undefined,
        status:
          "status" in patch
            ? patch.status === "all"
              ? undefined
              : patch.status
            : filterStatus === "all"
              ? undefined
              : filterStatus,
      },
      replace: true,
    });
  };

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

      <div className={cn("relative", isDetailView && "fade-in mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-7 sm:pb-7 lg:px-8")}>
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
              <ServiceDetailPage wid={wid} service={selected} initialTab={detailTab} />
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
            <div className="space-y-5">
              <ServiceSummaryBar services={sorted} />
              <DeployServiceToolbar
                services={sorted}
                query={searchQuery}
                status={filterStatus}
                shown={filtered.length}
                onQueryChange={(q) => setIndexSearch({ q: q || undefined })}
                onStatusChange={(status) => setIndexSearch({ status })}
              />
              {filtered.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-8 text-center shadow-[var(--shadow-xs)]">
                  <p className="text-[13px] font-medium text-[var(--color-fg)]">No matching services</p>
                  <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
                    Try a different search or filter.
                  </p>
                  {(searchQuery || filterStatus !== "all") && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => setIndexSearch({ q: undefined, status: "all" })}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((service) => (
                    <ServiceCard key={service.id} wid={wid} service={service} />
                  ))}
                </div>
              )}
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
    <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-8 sm:pt-16">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-pop)]">
        <div className="h-1 bg-[linear-gradient(90deg,var(--color-accent)_0%,color-mix(in_srgb,var(--color-accent)_40%,transparent)_100%)]" />
        <div className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
            <Lock size={20} />
          </div>
          <h2 className="mt-5 text-[17px] font-medium tracking-tight text-[var(--color-fg)]">
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg-muted)]">{description}</p>
          <div className="mt-6">
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
        search={EMPTY_DEPLOYMENTS_SEARCH}
        className="text-[13px] text-[var(--color-link)] no-underline hover:underline"
      >
        Back to deployments
      </Link>
    </div>
  );
}

function ServiceSummaryBar({ services }: { services: DeployService[] }) {
  const counts = services.reduce(
    (acc, service) => {
      if (deployStatusActive(service.status)) acc.live += 1;
      else if (deployStatusPending(service.status)) acc.pending += 1;
      else if (service.status === "failed") acc.failed += 1;
      else acc.other += 1;
      return acc;
    },
    { live: 0, pending: 0, failed: 0, other: 0 },
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Services" value={services.length} sub="in workspace" />
      <StatTile
        label="Live"
        value={counts.live}
        accent={counts.live > 0 ? "var(--color-ok)" : undefined}
        sub="healthy or running"
      />
      <StatTile
        label="Deploying"
        value={counts.pending}
        accent={counts.pending > 0 ? "var(--color-warn)" : undefined}
        sub="in progress"
      />
      <StatTile
        label="Failed"
        value={counts.failed}
        accent={counts.failed > 0 ? "var(--color-err)" : undefined}
        sub="needs attention"
      />
    </div>
  );
}

function DeployServiceToolbar({
  services,
  query,
  status,
  shown,
  onQueryChange,
  onStatusChange,
}: {
  services: DeployService[];
  query: string;
  status: DeployServiceFilter;
  shown: number;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: DeployServiceFilter) => void;
}) {
  const counts = useMemo(() => {
    const tallies = { all: services.length, live: 0, deploying: 0, failed: 0, stopped: 0 };
    for (const service of services) {
      const bucket = deployServiceFilterBucket(service.status);
      if (bucket !== "all") tallies[bucket] += 1;
    }
    return tallies;
  }, [services]);

  const pills: Array<{ value: DeployServiceFilter; label: string; n: number; color?: string }> = [
    { value: "all", label: "All", n: counts.all },
    { value: "live", label: "Live", n: counts.live, color: "var(--color-ok)" },
    { value: "deploying", label: "Deploying", n: counts.deploying, color: "var(--color-warn)" },
    { value: "failed", label: "Failed", n: counts.failed, color: "var(--color-err)" },
    { value: "stopped", label: "Stopped", n: counts.stopped },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="h-9 max-w-md flex-1 rounded-[var(--radius-md)] border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
          <InputGroupAddon>
            <Search size={14} className="text-[var(--color-fg-dim)]" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search name, image, region…"
            className="text-[13px]"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Clear search"
                onClick={() => onQueryChange("")}
              >
                <X size={13} />
              </Button>
            </InputGroupAddon>
          )}
        </InputGroup>
        <span className="shrink-0 text-[12px] text-[var(--color-fg-muted)] tabular">
          {shown} of {services.length} shown
        </span>
      </div>
      <div className="deploy-tab-rail -mx-1 overflow-x-auto px-1">
        <div className="flex w-max items-center gap-1.5 pb-0.5">
          {pills.map((pill) => {
            const active = status === pill.value;
            return (
              <Button
                key={pill.value}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={active}
                onClick={() => onStatusChange(active && pill.value !== "all" ? "all" : pill.value)}
                className={cn(
                  "h-7 shrink-0 rounded-full px-2.5 text-[12px] font-medium shadow-none",
                  active
                    ? "border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
                    : "border-transparent text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]",
                )}
              >
                {pill.color && (
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: pill.color }} />
                )}
                {pill.label}
                <span className="tabular text-[11px] text-[var(--color-fg-dim)]">{pill.n}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ wid, service }: { wid: string; service: DeployService }) {
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const pending = deployStatusPending(service.status);
  const glow = DEPLOY_GLOW_CLASS[service.status];

  return (
    <Link
      to="/$wid/deployments/$serviceId"
      params={{ wid, serviceId: service.id }}
      className={cn(
        "deploy-card group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)]",
        "border border-[var(--color-border)] bg-[var(--color-bg-elev)] no-underline",
        glow,
      )}
      style={{ boxShadow: surfaceShadow(service.status) }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
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
          <h2 className="truncate text-[13px] font-medium tracking-tight text-[var(--color-fg)] group-hover:text-[var(--color-link)]">
            {service.name}
          </h2>
        </div>
        <ChevronRight
          size={14}
          className="shrink-0 text-[var(--color-fg-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-fg-muted)]"
        />
      </div>

      <div className="flex flex-1 flex-col px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color }}
            >
              {DEPLOY_STATUS_LABEL[service.status]}
            </div>
            <div className="mono mt-1.5 truncate text-[12px] text-[var(--color-fg-muted)]">
              {service.image}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              compute
            </div>
            <div className="mt-1.5 text-[12px] font-medium text-[var(--color-fg)]">
              {resourcePresetLabel(service.resource_preset)}
            </div>
          </div>
        </div>

        <DeployHealthStrip status={service.status} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <MetaChip icon={MapPin} label={service.region} />
            <MetaChip label={service.environment} />
            <MetaChip label={`:${service.internal_port}`} />
          </div>
          <span className="mono shrink-0 text-[10px] text-[var(--color-fg-dim)]">
            {service.url
              ? service.url.replace(/^https?:\/\//, "")
              : lastSeen(service.updated_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DeployHealthStrip({ status }: { status: DeployStatus }) {
  const ticks = 24;
  const items = Array.from({ length: ticks }, (_, i) => {
    if (i !== ticks - 1) return "idle";
    if (deployStatusActive(status)) return "live";
    if (deployStatusPending(status)) return "pending";
    if (status === "failed") return "failed";
    return "idle";
  });

  return (
    <div className="mt-3.5 flex h-2 items-center gap-[2px]">
      {items.map((kind, i) => (
        <span
          key={i}
          className="h-full flex-1 rounded-[2px]"
          style={{
            background:
              kind === "live"
                ? "var(--color-ok)"
                : kind === "pending"
                  ? "var(--color-warn)"
                  : kind === "failed"
                    ? "var(--color-err)"
                    : "var(--color-border-hi)",
            opacity: kind === "idle" ? 0.45 : 0.92,
          }}
        />
      ))}
    </div>
  );
}

function ServiceDetailPage({
  wid,
  service,
  initialTab,
}: {
  wid: string;
  service: DeployService;
  initialTab?: DeployDetailTab;
}) {
  const navigate = useNavigate();
  const tab = initialTab ?? "deployments";
  const setTab = (next: DetailTab) => {
    void navigate({
      to: "/$wid/deployments/$serviceId",
      params: { wid, serviceId: service.id },
      search: next === "deployments" ? {} : { tab: next },
      replace: true,
    });
  };
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const glow = DEPLOY_GLOW_CLASS[service.status];

  return (
    <>
      <Link
        to="/$wid/deployments"
        params={{ wid }}
        search={EMPTY_DEPLOYMENTS_SEARCH}
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)]"
      >
        <ArrowLeft size={12} /> All services
      </Link>

      <div
        className={cn(
          "mb-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]",
          glow,
        )}
      >
        <div className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
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
                <h1 className="truncate text-[22px] font-medium tracking-tight text-[var(--color-fg)] sm:text-[23px]">
                  {service.name}
                </h1>
                <StatusBadge status={service.status} />
              </div>
              <div className="mono mt-2 truncate text-[12px] text-[var(--color-fg-muted)]">
                {service.image}
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <ServiceActionButtons
                service={service}
                createDeployment={createDeployment}
                rollback={rollback}
                stop={stop}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <DetailStat label="Region" value={service.region} icon={MapPin} />
            <DetailStat label="Environment" value={service.environment} />
            <DetailStat label="Port" value={`:${service.internal_port}`} mono />
            <DetailStat
              label="Compute"
              value={resourcePresetLabel(service.resource_preset)}
              sub={resourcePresetDetail(service.resource_preset)}
            />
          </div>

          {service.url && (
            <a
              href={service.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[12px] text-[var(--color-link)] no-underline hover:underline"
            >
              <Globe size={12} className="shrink-0" />
              <span className="truncate">{service.url.replace(/^https?:\/\//, "")}</span>
              <ExternalLink size={11} className="shrink-0 opacity-60" />
            </a>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5 sm:px-5">
          <div className="deploy-tab-rail -mx-1 min-w-0 flex-1 overflow-x-auto px-1">
            <Segmented
              value={tab}
              onChange={setTab}
              size="sm"
              options={[
                { value: "deployments", label: "Deploys", icon: Rocket },
                { value: "events", label: "Events", icon: ScrollText },
                { value: "logs", label: "Logs", icon: Terminal },
                { value: "metrics", label: "Metrics", icon: Activity },
                { value: "domains", label: "Domains", icon: Globe },
                { value: "settings", label: "Settings", icon: Settings },
              ]}
            />
          </div>
          <span className="mono hidden shrink-0 text-[10px] text-[var(--color-fg-dim)] sm:inline">
            {service.provider_service_id ?? service.slug}
          </span>
        </div>

        <div className="min-h-[360px] p-4 sm:p-5">
          {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
          {tab === "events" && <EventsPanel wid={wid} service={service} />}
          {tab === "logs" && <LogsPanel wid={wid} service={service} />}
          {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
          {tab === "domains" && <DomainsPanel wid={wid} service={service} />}
          {tab === "settings" && <SettingsPanel wid={wid} service={service} />}
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:hidden">
        <ServiceActionButtons
          service={service}
          createDeployment={createDeployment}
          rollback={rollback}
          stop={stop}
          fullWidth
        />
      </div>
    </>
  );
}

function DetailStat({
  label,
  value,
  sub,
  icon: Icon,
  mono = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: typeof MapPin;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-[13px] font-medium text-[var(--color-fg)]",
          mono && "mono text-[12px]",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-[var(--color-fg-muted)]">{sub}</div>}
    </div>
  );
}

function ServiceActionButtons({
  service,
  createDeployment,
  rollback,
  stop,
  fullWidth = false,
}: {
  service: DeployService;
  createDeployment: ReturnType<typeof useCreateDeployment>;
  rollback: ReturnType<typeof useRollbackDeployment>;
  stop: ReturnType<typeof useStopDeployService>;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", fullWidth && "w-full [&>button]:flex-1")}>
      {service.url && (
        <Button
          render={<a href={service.url} target="_blank" rel="noreferrer" />}
          variant="secondary"
          size="sm"
          className={fullWidth ? "flex-1" : undefined}
        >
          <ExternalLink size={13} /> Open
        </Button>
      )}
      <Button
        type="button"
        variant="default"
        size="sm"
        className={fullWidth ? "flex-1" : undefined}
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
        className={fullWidth ? "flex-1" : undefined}
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
        <Square size={13} />
        {!fullWidth && " Stop"}
      </Button>
    </div>
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
      {deployments.data.map((deployment, index) => (
        <div
          key={deployment.id}
          className="fade-in"
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <DeploymentRow deployment={deployment} />
        </div>
      ))}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const color = DEPLOY_STATUS_COLOR[deployment.status];
  const active = deployStatusActive(deployment.status);
  const pending = deployStatusPending(deployment.status);

  return (
    <div
      className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] transition-colors hover:border-[var(--color-border-hi)]"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                active && "pulse-dot",
                pending && "animate-pulse",
              )}
              style={{ background: color }}
            />
            <div className="mono truncate text-[12px] font-medium text-[var(--color-fg)]">
              {deployment.image}
            </div>
          </div>
          {deployment.image_digest && (
            <div className="mt-1 pl-3.5">
              <CopyChip value={deployment.image_digest} label={`${deployment.image_digest.slice(0, 24)}…`} />
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 pl-3.5 text-[11px] text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-1">
              <Clock size={10} className="text-[var(--color-fg-dim)]" />
              queued {lastSeen(deployment.created_at)}
            </span>
            {deployment.started_at && <span>started {lastSeen(deployment.started_at)}</span>}
            {deployment.finished_at && <span>finished {lastSeen(deployment.finished_at)}</span>}
          </div>
        </div>
        <StatusBadge status={deployment.status} />
      </div>
      {deployment.failure_message && (
        <div className="border-t border-[color-mix(in_srgb,var(--color-err)_20%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-err)_6%,transparent)] px-4 py-2.5">
          <p className="text-[12px] leading-5 text-[var(--color-err)]">{deployment.failure_message}</p>
        </div>
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
    <LogConsole
      title="Lifecycle events"
      icon={ScrollText}
      lines={events.data.map((event) => ({
        id: event.id,
        level: event.level,
        message: event.message,
        timestamp: event.created_at,
      }))}
    />
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
    <LogConsole
      title="Runtime logs"
      icon={Terminal}
      lines={logs.data.map((line, index) => ({
        id: `${line.timestamp}-${index}`,
        level: line.level,
        message: line.message,
        timestamp: line.timestamp,
      }))}
    />
  );
}

const METRIC_TILES: Array<{ kind: MetricChartKind; label: string; icon: typeof Cpu }> = [
  { kind: "cpu", label: "CPU", icon: Cpu },
  { kind: "memory", label: "Memory", icon: MemoryStick },
  { kind: "requests", label: "Requests", icon: Network },
];

function MetricsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const metrics = useDeployMetrics(wid, service.id);
  const [chartKind, setChartKind] = useState<MetricChartKind>("cpu");

  if (metrics.isLoading) {
    return (
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
        <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] border-b border-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2 px-3.5 py-3">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
        <div className="p-3 sm:p-4">
          <MetricsLineChart points={[]} metric="cpu" loading />
        </div>
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

  const points = metrics.data;
  const lastBucket = points[points.length - 1].bucket_start;
  const selected = metricStats(points, chartKind);

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] border-b border-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {METRIC_TILES.map((tile) => {
          const stats = metricStats(points, tile.kind);
          const high = tile.kind === "cpu" && stats.latest != null && stats.latest >= 80;
          return (
            <MetricTile
              key={tile.kind}
              icon={tile.icon}
              label={tile.label}
              value={formatStat(stats.latest, tile.kind)}
              sub={
                stats.peak == null
                  ? "no samples"
                  : `peak ${formatMetricChartValue(stats.peak, tile.kind)}`
              }
              active={chartKind === tile.kind}
              accent={high ? "var(--color-warn)" : undefined}
              onClick={() => setChartKind(tile.kind)}
            />
          );
        })}
      </div>
      <div className="p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
          <span className="text-[12px] font-medium text-[var(--color-fg)]">
            {metricChartLabel(chartKind)} over time
          </span>
          <span className="mono tabular text-[11px] text-[var(--color-fg-dim)]">
            avg {formatStat(selected.avg, chartKind)} · {selected.samples} pts ·{" "}
            {lastSeen(lastBucket)}
          </span>
        </div>
        <MetricsLineChart points={points} metric={chartKind} />
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  active,
  accent,
  onClick,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  sub: string;
  active: boolean;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col gap-1 px-4 py-3.5 text-left transition-colors sm:px-3.5 sm:py-3",
        active
          ? "bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)]"
          : "hover:bg-[var(--color-bg-row)]",
      )}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        <Icon size={11} />
        {label}
      </span>
      <span
        className="tabular text-[19px] font-medium leading-none text-[var(--color-fg)]"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      <span className="tabular text-[10px] text-[var(--color-fg-muted)]">{sub}</span>
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--color-accent)]" />
      )}
    </button>
  );
}

interface MetricChartRow extends Record<string, unknown> {
  date: Date;
  value: number;
  raw: number | null;
}

function MetricsLineChart({
  points,
  metric,
  loading = false,
}: {
  points: DeployMetricPoint[];
  metric: MetricChartKind;
  loading?: boolean;
}) {
  const data = useMemo<MetricChartRow[]>(
    () =>
      points.map((point) => {
        const raw = metricChartValue(point, metric);
        return {
          date: new Date(point.bucket_start),
          value: raw ?? 0,
          raw,
        };
      }),
    [points, metric],
  );

  return (
    <LineChart
      data={data}
      xDataKey="date"
      aspectRatio=""
      style={{ height: 220 }}
      status={loading ? "loading" : "ready"}
      loadingLabel={loading ? "Loading metrics" : undefined}
      margin={{ top: 16, right: 10, bottom: 26, left: 10 }}
      revealSignature={`${metric}:${data.length}`}
    >
      <Grid horizontal numTicksRows={4} />
      <Line dataKey="value" strokeWidth={1.75} />
      <XAxis numTicks={5} />
      <ChartTooltip
        rows={(point) => {
          const row = point as MetricChartRow;
          return [
            {
              color: "var(--chart-line-primary)",
              label: metricChartLabel(metric),
              value:
                typeof row.raw === "number"
                  ? formatMetricChartValue(row.raw, metric)
                  : "No sample",
            },
          ];
        }}
        dotColor="var(--chart-line-primary)"
      />
    </LineChart>
  );
}

function metricChartValue(point: DeployMetricPoint, metric: MetricChartKind): number | null {
  switch (metric) {
    case "cpu":
      return point.cpu_percent;
    case "memory":
      return point.memory_mb;
    case "requests":
      return point.requests;
  }
}

function metricChartLabel(metric: MetricChartKind): string {
  switch (metric) {
    case "cpu":
      return "CPU";
    case "memory":
      return "Memory";
    case "requests":
      return "Requests";
  }
}

function formatMetricChartValue(value: number, metric: MetricChartKind): string {
  switch (metric) {
    case "cpu":
      return `${value.toFixed(1)}%`;
    case "memory":
      return `${value.toFixed(0)} MB`;
    case "requests":
      return Math.round(value).toLocaleString();
  }
}

function formatStat(value: number | null, metric: MetricChartKind): string {
  return value == null ? "—" : formatMetricChartValue(value, metric);
}

interface MetricStats {
  latest: number | null;
  peak: number | null;
  avg: number | null;
  samples: number;
}

function metricStats(points: DeployMetricPoint[], metric: MetricChartKind): MetricStats {
  const values: number[] = [];
  for (const point of points) {
    const value = metricChartValue(point, metric);
    if (value != null) values.push(value);
  }
  const latest = points.length ? metricChartValue(points[points.length - 1], metric) : null;
  const peak = values.length ? Math.max(...values) : null;
  const avg = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  return { latest, peak, avg, samples: points.length };
}

function normalizeResourcePreset(value: string): DeployResourcePreset {
  return RESOURCE_PRESETS.some((preset) => preset.value === value)
    ? (value as DeployResourcePreset)
    : "preview_small";
}

function resourcePresetLabel(value: string): string {
  return (
    RESOURCE_PRESETS.find((preset) => preset.value === value)?.label ??
    value.replace(/^preview_/, "")
  );
}

function resourcePresetDetail(value: string): string {
  return RESOURCE_PRESETS.find((preset) => preset.value === value)?.detail ?? value;
}

function SettingsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const navigate = useNavigate();
  const updateService = useUpdateDeployService(wid);
  const deleteService = useDeleteDeployService(wid);
  const volumes = useDeployServiceVolumes(wid, service.id);
  const createVolume = useCreateDeployServiceVolume(wid);
  const updateVolume = useUpdateDeployServiceVolume(wid);
  const deleteVolume = useDeleteDeployServiceVolume(wid);
  const [volumeName, setVolumeName] = useState("");
  const [mountPath, setMountPath] = useState("/data");
  const [sizeGb, setSizeGb] = useState(1);

  function submitVolume(event: FormEvent) {
    event.preventDefault();
    createVolume.mutate(
      {
        serviceId: service.id,
        name: volumeName,
        mount_path: mountPath,
        size_gb: sizeGb,
      },
      {
        onSuccess: () => {
          toast.success("Volume attached");
          setVolumeName("");
          setMountPath("/data");
          setSizeGb(1);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function removeService() {
    if (!window.confirm(`Delete ${service.name}? This stops deployments and queues provider cleanup.`)) {
      return;
    }
    deleteService.mutate(service.id, {
      onSuccess: () => {
        toast.success("Service deletion queued");
        void navigate({ to: "/$wid/deployments", params: { wid } });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] md:items-end">
        <div>
          <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Compute</h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-muted)]">
            Applied when the next deployment creates a machine.
          </p>
        </div>
        <select
          className={cn(fieldControlClass, "h-9")}
          value={normalizeResourcePreset(service.resource_preset)}
          disabled={updateService.isPending}
          onChange={(event) =>
            updateService.mutate(
              {
                serviceId: service.id,
                resource_preset: event.target.value as DeployResourcePreset,
              },
              {
                onSuccess: () => toast.success("Compute size updated"),
                onError: (err) => toast.error((err as Error).message),
              },
            )
          }
        >
          {RESOURCE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label} · {preset.detail}
            </option>
          ))}
        </select>
      </section>

      <section className="border-t border-[var(--color-border)] pt-5">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive size={14} className="text-[var(--color-fg-muted)]" />
          <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Volumes</h2>
        </div>
        <form onSubmit={submitVolume} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
          <input
            className={cn(fieldControlClass, "h-9")}
            value={volumeName}
            onChange={(event) => setVolumeName(event.target.value)}
            placeholder="data"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <input
            className={cn(fieldControlClass, "h-9")}
            value={mountPath}
            onChange={(event) => setMountPath(event.target.value)}
            placeholder="/data"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <input
            type="number"
            min={1}
            max={50}
            className={cn(fieldControlClass, "h-9")}
            value={sizeGb}
            onChange={(event) => setSizeGb(Number(event.target.value))}
            required
          />
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={createVolume.isPending || !volumeName.trim() || !mountPath.trim()}
          >
            {createVolume.isPending && <Spinner className="size-3" />}
            <Plus size={13} /> Attach
          </Button>
        </form>

        <div className="mt-3 space-y-2">
          {volumes.isLoading ? (
            <PanelLoading label="Loading volumes…" />
          ) : !volumes.data?.length ? (
            <PanelEmpty
              icon={HardDrive}
              label="No volumes attached"
              hint="Attach a volume, then deploy to mount it on the next machine."
            />
          ) : (
            volumes.data.map((volume) => (
              <VolumeRow
                key={volume.id}
                volume={volume}
                updating={updateVolume.isPending}
                deleting={deleteVolume.isPending}
                onUpdate={(volumeId, mountPath) =>
                  updateVolume.mutate(
                    { serviceId: service.id, volumeId, mount_path: mountPath },
                    {
                      onSuccess: () => toast.success("Volume mount path updated"),
                      onError: (err) => toast.error((err as Error).message),
                    },
                  )
                }
                onDelete={(volumeId) =>
                  deleteVolume.mutate(
                    { serviceId: service.id, volumeId },
                    {
                      onSuccess: () => toast.success("Volume removal queued"),
                      onError: (err) => toast.error((err as Error).message),
                    },
                  )
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="border-t border-[var(--color-border)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Delete service</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-muted)]">
              Hides the service and queues Fly resource cleanup.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleteService.isPending}
            onClick={removeService}
          >
            {deleteService.isPending && <Spinner className="size-3" />}
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </section>
    </div>
  );
}

function VolumeRow({
  volume,
  updating,
  deleting,
  onUpdate,
  onDelete,
}: {
  volume: DeployServiceVolume;
  updating: boolean;
  deleting: boolean;
  onUpdate: (volumeId: string, mountPath: string) => void;
  onDelete: (volumeId: string) => void;
}) {
  const [mountPath, setMountPath] = useState(volume.mount_path);
  useEffect(() => {
    setMountPath(volume.mount_path);
  }, [volume.mount_path]);

  const trimmedMountPath = mountPath.trim();
  const changed = trimmedMountPath !== volume.mount_path;
  const busy = updating || deleting;

  function submitMountPath(event: FormEvent) {
    event.preventDefault();
    if (!trimmedMountPath || !changed || busy) {
      return;
    }
    onUpdate(volume.id, trimmedMountPath);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{volume.name}</p>
          <VolumeStatus status={volume.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
          <span>{volume.size_gb} GB</span>
          <span>{volume.region}</span>
          {volume.provider_volume_id && (
            <span className="mono">{volume.provider_volume_id.slice(0, 18)}</span>
          )}
        </div>
        <form onSubmit={submitMountPath} className="mt-2 flex max-w-md items-center gap-1.5">
          <input
            className={cn(fieldControlClass, "mono h-8 min-w-0 flex-1")}
            value={mountPath}
            onChange={(event) => setMountPath(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={!trimmedMountPath || !changed || busy}
            aria-label="Save mount path"
          >
            {updating ? <Spinner className="size-3" /> : <Save size={13} />}
          </Button>
          {changed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              onClick={() => setMountPath(volume.mount_path)}
              aria-label="Reset mount path"
            >
              <X size={13} />
            </Button>
          )}
        </form>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => onDelete(volume.id)}
      >
        <Trash2 size={13} /> Remove
      </Button>
    </div>
  );
}

function VolumeStatus({ status }: { status: string }) {
  const active = status === "created";
  const tone = active
    ? "border-[color-mix(in_srgb,var(--color-ok)_35%,transparent)] text-[var(--color-ok)]"
    : status === "failed"
      ? "border-[color-mix(in_srgb,var(--color-err)_35%,transparent)] text-[var(--color-err)]"
      : "border-[color-mix(in_srgb,var(--color-warn)_35%,transparent)] text-[var(--color-warn)]";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase",
        tone,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DomainsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const [hostname, setHostname] = useState("");
  const domains = useDeployServiceDomains(wid, service.id);
  const createDomain = useCreateDeployServiceDomain(wid);
  const verifyDomain = useVerifyDeployServiceDomain(wid);
  const deleteDomain = useDeleteDeployServiceDomain(wid);
  const canAddDomain = Boolean(service.provider_service_id);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = hostname.trim();
    if (!value) return;
    createDomain.mutate(
      { serviceId: service.id, hostname: value },
      {
        onSuccess: () => {
          toast.success("Custom domain queued");
          setHostname("");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  if (!canAddDomain) {
    return (
      <PanelEmpty
        icon={Globe}
        label="Deploy before adding domains"
        hint="Fly needs a provisioned app before Produktive can request certificates."
      />
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          className={cn(fieldControlClass, "h-9")}
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="app.example.com"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <Button
          type="submit"
          variant="default"
          size="sm"
          disabled={createDomain.isPending || !hostname.trim()}
        >
          {createDomain.isPending && <Spinner className="size-3" />}
          <Plus size={13} /> Add domain
        </Button>
      </form>

      {domains.isLoading ? (
        <PanelLoading label="Loading domains…" />
      ) : !domains.data?.length ? (
        <PanelEmpty
          icon={Globe}
          label="No custom domains"
          hint="Add a hostname to request a Fly certificate and DNS records."
        />
      ) : (
        <div className="space-y-3">
          {domains.data.map((domain) => (
            <DomainRow
              key={domain.id}
              domain={domain}
              verifying={verifyDomain.isPending}
              deleting={deleteDomain.isPending}
              onVerify={(domainId) =>
                verifyDomain.mutate(
                  { serviceId: service.id, domainId },
                  {
                    onSuccess: () => toast.success("Domain check queued"),
                    onError: (err) => toast.error((err as Error).message),
                  },
                )
              }
              onDelete={(domainId) =>
                deleteDomain.mutate(
                  { serviceId: service.id, domainId },
                  {
                    onSuccess: () => toast.success("Domain removal queued"),
                    onError: (err) => toast.error((err as Error).message),
                  },
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainRow({
  domain,
  verifying,
  deleting,
  onVerify,
  onDelete,
}: {
  domain: DeployServiceDomain;
  verifying: boolean;
  deleting: boolean;
  onVerify: (domainId: string) => void;
  onDelete: (domainId: string) => void;
}) {
  const records = dnsRecords(domain);
  const active = domain.status === "active" || Boolean(domain.verified_at);
  const errors = validationErrors(domain.validation_errors);
  const errorTone =
    domain.status === "failed"
      ? "text-[var(--color-err)]"
      : "text-[var(--color-warn)]";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">
              {domain.hostname}
            </p>
            <DomainStatus status={domain.status} active={active} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
            {active ? "certificate active" : `updated ${lastSeen(domain.updated_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={records.length === 0}
            title={records.length === 0 ? "Waiting for DNS records" : "Download DNS records"}
            onClick={() => downloadDnsFile(domain, records)}
          >
            <Download size={13} /> DNS
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={verifying || deleting}
            onClick={() => onVerify(domain.id)}
          >
            <CheckCircle2 size={13} /> Check
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => onDelete(domain.id)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {records.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {records.map((record, index) => (
            <DnsRecordRow
              key={`${record.type}-${record.name}-${record.value}-${index}`}
              record={record}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] px-3 py-2 text-[12px] text-[var(--color-fg-muted)]">
          Waiting for Fly DNS requirements.
        </p>
      )}

      {errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {errors.map((error, index) => (
            <p key={index} className={cn("text-[12px] leading-5", errorTone)}>
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function DnsRecordRow({ record }: { record: DnsRecord }) {
  return (
    <div className="grid gap-2 border-b border-[var(--color-border)] px-3 py-2 last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.4fr)_32px] sm:items-center">
      <span className="mono text-[11px] font-medium text-[var(--color-fg)]">{record.type}</span>
      <span className="mono min-w-0 break-all text-[11px] text-[var(--color-fg-muted)]">
        {record.name}
      </span>
      <span className="mono min-w-0 break-all text-[11px] text-[var(--color-fg)]">
        {record.value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy DNS value"
        onClick={() => {
          void navigator.clipboard?.writeText(record.value);
          toast.success("DNS value copied");
        }}
      >
        <Copy size={13} />
      </Button>
    </div>
  );
}

function DomainStatus({ status, active }: { status: string; active: boolean }) {
  const tone = active
    ? "border-[color-mix(in_srgb,var(--color-ok)_35%,transparent)] text-[var(--color-ok)]"
    : status === "failed"
      ? "border-[color-mix(in_srgb,var(--color-err)_35%,transparent)] text-[var(--color-err)]"
      : "border-[color-mix(in_srgb,var(--color-warn)_35%,transparent)] text-[var(--color-warn)]";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase",
        tone,
      )}
    >
      {active ? "active" : status.replace(/_/g, " ")}
    </span>
  );
}

type DnsRecord = {
  type: string;
  name: string;
  value: string;
};

type FlyDnsRequirements = {
  a?: string[];
  aaaa?: string[];
  cname?: string;
  acme_challenge?: { name?: string; target?: string };
  ownership?: { name?: string; app_value?: string; org_value?: string };
};

function dnsRecords(domain: DeployServiceDomain): DnsRecord[] {
  const req = flyDnsRequirements(domain.dns_requirements);
  const records: DnsRecord[] = [];
  if (req.cname) {
    records.push({ type: "CNAME", name: domain.hostname, value: req.cname });
  } else {
    for (const value of req.a ?? []) {
      records.push({ type: "A", name: domain.hostname, value });
    }
    for (const value of req.aaaa ?? []) {
      records.push({ type: "AAAA", name: domain.hostname, value });
    }
  }
  if (req.ownership?.name && (req.ownership.app_value || req.ownership.org_value)) {
    records.push({
      type: "TXT",
      name: req.ownership.name,
      value: req.ownership.app_value ?? req.ownership.org_value ?? "",
    });
  }
  if (req.acme_challenge?.name && req.acme_challenge.target) {
    records.push({
      type: "CNAME",
      name: req.acme_challenge.name,
      value: req.acme_challenge.target,
    });
  }
  return records.filter((record) => record.value.length > 0);
}

function downloadDnsFile(domain: DeployServiceDomain, records: DnsRecord[]) {
  if (records.length === 0) {
    toast.error("DNS records are not ready yet");
    return;
  }
  const blob = new Blob([dnsFileContents(domain, records)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dnsFileName(domain.hostname);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.success("DNS file downloaded");
}

function dnsFileName(hostname: string): string {
  const safeHostname = hostname
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `produktive-dns-${safeHostname || "domain"}.zone`;
}

function dnsFileContents(domain: DeployServiceDomain, records: DnsRecord[]): string {
  const lines = [
    `; Produktive DNS records for ${domain.hostname}`,
    `; Generated ${new Date().toISOString()}`,
    "; Add these records at your DNS provider, then run Check in Produktive.",
    "",
    "$TTL 300",
    ...records.map((record) => dnsZoneLine(record)),
    "",
  ];
  return lines.join("\n");
}

function dnsZoneLine(record: DnsRecord): string {
  return `${absoluteDnsName(record.name)} 300 IN ${record.type} ${dnsZoneValue(record)}`;
}

function dnsZoneValue(record: DnsRecord): string {
  if (record.type === "TXT") return quoteDnsText(record.value);
  if (record.type === "CNAME") return absoluteDnsName(record.value);
  return record.value;
}

function quoteDnsText(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function absoluteDnsName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "@") return trimmed;
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function flyDnsRequirements(value: unknown): FlyDnsRequirements {
  if (!value || typeof value !== "object") return {};
  return value as FlyDnsRequirements;
}

function validationErrors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(formatValidationError);
  }
  if (typeof value === "string" && value.trim()) return [value];
  if (value && typeof value === "object" && Object.keys(value).length > 0) {
    return [formatValidationError(value)];
  }
  return [];
}

function formatValidationError(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "";
  const remediation = typeof record.remediation === "string" ? record.remediation : "";
  if (message && remediation) return `${message}. ${remediation}`;
  if (message) return message;
  return JSON.stringify(value);
}

type LevelFilter = "all" | "warn" | "error";

interface ConsoleLine {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

const LEVEL_FILTERS: Array<{ value: LevelFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "warn", label: "Warnings" },
  { value: "error", label: "Errors" },
];

function LogConsole({
  title,
  icon: Icon,
  lines,
}: {
  title: string;
  icon: typeof Rocket;
  lines: ConsoleLine[];
}) {
  const [filter, setFilter] = useState<LevelFilter>("all");
  const visible = useMemo(
    () => lines.filter((line) => lineMatchesFilter(line.level, filter)),
    [lines, filter],
  );

  function copyAll() {
    const text = visible
      .map((line) => `${logClock(line.timestamp)} ${line.level.toUpperCase()} ${line.message}`)
      .join("\n");
    if (!text) {
      toast.error("Nothing to copy");
      return;
    }
    void navigator.clipboard?.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <PanelCard
      title={title}
      icon={Icon}
      count={filter === "all" ? `${lines.length} lines` : `${visible.length} / ${lines.length}`}
      live
      actions={
        <>
          <Segmented<LevelFilter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={LEVEL_FILTERS}
          />
          <Button type="button" variant="ghost" size="sm" onClick={copyAll}>
            <Copy size={13} />
            <span className="hidden sm:inline"> Copy</span>
          </Button>
        </>
      }
      className="bg-[var(--color-bg-sunken)] shadow-none"
      bodyClassName="p-0"
    >
      <ScrollArea className="h-[min(360px,50vh)] sm:h-[360px]">
        <div className="mono space-y-px p-2 text-[11px] leading-5">
          {visible.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-[12px] text-[var(--color-fg-dim)]">
              No matching lines
            </div>
          ) : (
            visible.map((line) => <LogRow key={line.id} line={line} />)
          )}
        </div>
      </ScrollArea>
    </PanelCard>
  );
}

function LogRow({ line }: { line: ConsoleLine }) {
  const color = levelColor(line.level);
  return (
    <div
      className="group grid grid-cols-1 gap-0.5 rounded-[var(--radius-sm)] border-l-2 py-[4px] pl-2.5 pr-1.5 transition-colors hover:bg-[var(--color-bg-row)] sm:grid-cols-[58px_46px_minmax(0,1fr)] sm:items-baseline sm:gap-x-2.5"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      <div className="flex items-baseline gap-2 sm:contents">
        <span className="tabular text-[var(--color-fg-dim)]" title={logFullTime(line.timestamp)}>
          {logClock(line.timestamp)}
        </span>
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-[0.04em] sm:max-w-none"
          style={{ color }}
        >
          {line.level}
        </span>
      </div>
      <span className="min-w-0 whitespace-pre-wrap break-words text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
        {line.message}
      </span>
    </div>
  );
}

function levelColor(level: string): string {
  const normalized = level.toLowerCase();
  if (["error", "err", "fatal", "critical", "panic"].includes(normalized)) {
    return "var(--color-err)";
  }
  if (["warn", "warning"].includes(normalized)) {
    return "var(--color-warn)";
  }
  if (["debug", "trace"].includes(normalized)) {
    return "var(--color-fg-dim)";
  }
  return "var(--color-fg-muted)";
}

function lineMatchesFilter(level: string, filter: LevelFilter): boolean {
  if (filter === "all") return true;
  const normalized = level.toLowerCase();
  const isError = ["error", "err", "fatal", "critical", "panic"].includes(normalized);
  if (filter === "error") return isError;
  return isError || ["warn", "warning"].includes(normalized);
}

function logClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function logFullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
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
    resource_preset: DeployResourcePreset;
  }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [credentialId, setCredentialId] = useState("");
  const [port, setPort] = useState(3000);
  const [environment, setEnvironment] = useState("production");
  const [region, setRegion] = useState("fra");
  const [health, setHealth] = useState("/");
  const [resourcePreset, setResourcePreset] = useState<DeployResourcePreset>("preview_small");
  const [envText, setEnvText] = useState("");
  const [secretText, setSecretText] = useState("");

  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  const basicsValid = name.trim().length > 0 && image.trim().length > 0 && port >= 1 && port <= 65535;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 1) {
      if (!basicsValid) return;
      setStep(2);
      return;
    }
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
        resource_preset: resourcePreset,
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New deployment service"
        description={
          step === 1
            ? "Step 1 of 2 — image and connectivity."
            : "Step 2 of 2 — runtime, compute, and secrets."
        }
        size="lg"
        footer={
          <>
            {step === 2 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
            ) : (
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
            )}
            <Button
              type="submit"
              form="deploy-service-form"
              variant="default"
              disabled={pending || (step === 1 && !basicsValid)}
            >
              {pending && <Spinner className="size-3" />}
              {step === 1 ? "Continue" : "Create service"}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-2">
          {[1, 2].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                n <= step ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
              )}
            />
          ))}
        </div>
        <form id="deploy-service-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {step === 1 ? (
            <>
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
              <Field label="Health path">
                <input
                  className={cn(fieldControlClass, "h-9")}
                  value={health}
                  onChange={(e) => setHealth(e.target.value)}
                  required
                />
              </Field>
            </>
          ) : (
            <>
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
              <Field label="Compute" className="sm:col-span-2">
                <select
                  className={cn(fieldControlClass, "h-9")}
                  value={resourcePreset}
                  onChange={(e) => setResourcePreset(e.target.value as DeployResourcePreset)}
                >
                  {RESOURCE_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label} · {preset.detail}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Env vars">
                <textarea
                  className={cn(fieldControlClass, "min-h-28 resize-y py-2")}
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  placeholder={"LOG_LEVEL=info"}
                />
              </Field>
              <Field label="Secrets">
                <textarea
                  className={cn(fieldControlClass, "min-h-28 resize-y py-2")}
                  value={secretText}
                  onChange={(e) => setSecretText(e.target.value)}
                  placeholder={"DATABASE_URL=postgres://..."}
                />
              </Field>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
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
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]"
          >
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="space-y-3 px-4 py-3.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-2 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-24" />
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <div className="space-y-3 border-b border-[var(--color-border)] p-5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-3 w-80" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-[var(--radius-md)]" />
            ))}
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="m-5 h-[360px] w-[calc(100%-2.5rem)] rounded-[var(--radius-md)]" />
      </div>
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
