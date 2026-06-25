import {
  Activity,
  ExternalLink,
  Gauge,
  Globe,
  LayoutGrid,
  Rocket,
  Settings,
  Terminal,
} from "lucide-react";
import { useParams } from "@tanstack/react-router";
import { resourcePresetLabel } from "#/components/DeployServiceCard";
import { Segmented } from "#/components/Segmented";
import { cn } from "#/lib/cn";
import { formatDeployRegion } from "#/lib/deploy-regions";
import {
  useCreateDeployment,
  useDeployRegions,
  useRollbackDeployment,
  useStopDeployService,
} from "#/lib/queries";
import {
  DEPLOY_STATUS_COLOR,
  DEPLOY_STATUS_LABEL,
  deployStatusActive,
} from "#/lib/status";
import type { DeployDetailTab } from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { ServiceActionButtons } from "./deploy-shared";
import {
  ConfigurationPanel,
  DeploymentsPanel,
  LogsPanel,
  MetricsPanel,
  OverviewPanel,
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
  const { wid: routeWid } = useParams({ from: "/_authed/$wid" });
  const { data: regions } = useDeployRegions(routeWid);
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg-elev)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  active && "pulse-dot",
                )}
                style={{
                  background: color,
                  boxShadow: active
                    ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`
                    : undefined,
                }}
              />
              <h2 className="truncate text-[15px] font-medium tracking-tight text-[var(--color-fg)]">
                {service.name}
              </h2>
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color }}
              >
                {DEPLOY_STATUS_LABEL[service.status]}
              </span>
            </div>
            <p className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
              {service.image}
            </p>
            <p className="mt-1.5 text-[11px] text-[var(--color-fg-dim)]">
              {formatDeployRegion(service.region, regions)}
              <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
              {service.environment}
              <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
              :{service.internal_port}
              <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
              {resourcePresetLabel(service.resource_preset)}
            </p>
            {service.url && (
              <a
                href={service.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex max-w-full items-center gap-1 text-[11px] text-[var(--color-link)] no-underline hover:underline"
              >
                <Globe size={11} className="shrink-0" />
                <span className="truncate">{service.url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink size={10} className="shrink-0 opacity-60" />
              </a>
            )}
          </div>

          <div className="hidden shrink-0 sm:block">
            <ServiceActionButtons
              service={service}
              createDeployment={createDeployment}
              rollback={rollback}
              stop={stop}
              compact
            />
          </div>
        </div>

        <div className="mt-3 sm:hidden">
          <ServiceActionButtons
            service={service}
            createDeployment={createDeployment}
            rollback={rollback}
            stop={stop}
            compact
            fullWidth
          />
        </div>
      </div>

      <div className="sticky top-0 z-10 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2">
        <div className="deploy-tab-rail -mx-0.5 min-w-0 overflow-x-auto px-0.5">
          <Segmented
            value={tab}
            onChange={onTabChange}
            size="sm"
            options={[
              { value: "overview", label: "Overview", icon: LayoutGrid },
              { value: "deployments", label: "Deploys", icon: Rocket },
              { value: "logs", label: "Logs", icon: Terminal },
              { value: "metrics", label: "Metrics", icon: Activity },
              { value: "configuration", label: "Config", icon: Gauge },
              { value: "settings", label: "Settings", icon: Settings },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === "overview" && (
          <OverviewPanel
            wid={wid}
            service={service}
            onTabChange={onTabChange}
          />
        )}
        {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
        {tab === "logs" && <LogsPanel wid={wid} service={service} />}
        {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
        {tab === "configuration" && <ConfigurationPanel wid={wid} service={service} />}
        {tab === "settings" && (
          <SettingsPanel wid={wid} service={service} onDeleted={onDeleted} />
        )}
      </div>
    </div>
  );
}
