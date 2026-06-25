import {
  Activity,
  ExternalLink,
  Globe,
  MapPin,
  Rocket,
  ScrollText,
  Settings,
  Terminal,
} from "lucide-react";
import { resourcePresetLabel } from "#/components/DeployServiceCard";
import { Segmented } from "#/components/Segmented";
import { cn } from "#/lib/cn";
import type { DeployDetailTab } from "#/lib/deployments";
import {
  DEPLOY_GLOW_CLASS,
  DEPLOY_STATUS_COLOR,
  deployStatusActive,
} from "#/lib/status";
import {
  useCreateDeployment,
  useRollbackDeployment,
  useStopDeployService,
} from "#/lib/queries";
import type { DeployService } from "#/lib/types";
import {
  DetailStat,
  ServiceActionButtons,
  StatusBadge,
  resourcePresetDetail,
} from "./deploy-shared";
import {
  DeploymentsPanel,
  DomainsPanel,
  EventsPanel,
  LogsPanel,
  MetricsPanel,
  SettingsPanel,
} from "./DeployServicePanels";

export function DeployServiceDetail({
  wid,
  service,
  tab,
  onTabChange,
  onDeleted,
}: {
  wid: string;
  service: DeployService;
  tab: DeployDetailTab;
  onTabChange: (tab: DeployDetailTab) => void;
  onDeleted?: () => void;
}) {
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const glow = DEPLOY_GLOW_CLASS[service.status];

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]",
        glow,
      )}
    >
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-4 sm:px-5 sm:py-5">
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
              <h2 className="truncate text-[18px] font-medium tracking-tight text-[var(--color-fg)] sm:text-[20px]">
                {service.name}
              </h2>
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

        <div className="mt-4 sm:hidden">
          <ServiceActionButtons
            service={service}
            createDeployment={createDeployment}
            rollback={rollback}
            stop={stop}
            fullWidth
          />
        </div>
      </div>

      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-2.5 sm:px-5">
        <div className="deploy-tab-rail -mx-1 min-w-0 flex-1 overflow-x-auto px-1">
          <Segmented
            value={tab}
            onChange={onTabChange}
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
        {tab === "events" && <EventsPanel wid={wid} service={service} />}
        {tab === "logs" && <LogsPanel wid={wid} service={service} />}
        {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
        {tab === "domains" && <DomainsPanel wid={wid} service={service} />}
        {tab === "settings" && (
          <SettingsPanel wid={wid} service={service} onDeleted={onDeleted} />
        )}
      </div>
    </div>
  );
}
