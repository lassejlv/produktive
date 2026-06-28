import { ExternalLink } from "lucide-react";
import { X } from "lucide-react";
import { Segmented } from "#/components/Segmented";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/cn";
import {
  useCreateDeployment,
  useRollbackDeployment,
  useStopDeployService,
} from "#/lib/queries";
import { DEPLOY_STATUS_COLOR, DEPLOY_STATUS_LABEL, deployStatusActive } from "#/lib/status";
import type { DeployDetailTab, DeploySettingsSection } from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { ServiceActionButtons } from "./deploy-shared";
import { DeployServiceSettings } from "./DeployServiceSettings";
import {
  DeploymentsPanel,
  LogsPanel,
  MetricsPanel,
  VariablesPanel,
} from "./DeployServicePanels";

export function DeployServiceDetail({
  wid,
  service,
  tab,
  settingsSection,
  onTabChange,
  onSettingsSectionChange,
  onClose,
  onDeleted,
}: {
  wid: string;
  service: DeployService;
  tab: DeployDetailTab;
  settingsSection: DeploySettingsSection;
  onTabChange: (tab: DeployDetailTab) => void;
  onSettingsSectionChange: (section: DeploySettingsSection) => void;
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn("inline-block h-2 w-2 shrink-0 rounded-full", active && "pulse-dot")}
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
                className="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} 12%, transparent)`,
                }}
              >
                {DEPLOY_STATUS_LABEL[service.status]}
              </span>
            </div>
            <p className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
              {service.source_kind === "git"
                ? service.repo_url
                  ? service.repo_url.replace(/^https:\/\//, "") +
                    (service.git_ref ? ` @ ${service.git_ref}` : "")
                  : "GitHub source"
                : service.image}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {service.url && (
              <a
                href={service.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open service URL"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-muted)] no-underline transition-colors hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]"
              >
                <ExternalLink size={15} />
              </a>
            )}
            <div className="hidden sm:block">
              <ServiceActionButtons
                service={service}
                createDeployment={createDeployment}
                rollback={rollback}
                stop={stop}
                compact
              />
            </div>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="Close panel"
                className="text-[var(--color-fg-muted)]"
              >
                <X size={16} />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2.5 sm:hidden">
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
              { value: "deployments", label: "Deployments" },
              { value: "metrics", label: "Metrics" },
              { value: "variables", label: "Variables" },
              { value: "logs", label: "Logs" },
              { value: "settings", label: "Settings" },
            ]}
          />
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-3",
          tab === "settings" && "flex flex-col overflow-hidden py-3",
        )}
      >
        {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
        {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
        {tab === "variables" && <VariablesPanel wid={wid} service={service} />}
        {tab === "logs" && <LogsPanel wid={wid} service={service} />}
        {tab === "settings" && (
          <DeployServiceSettings
            wid={wid}
            service={service}
            section={settingsSection}
            onSectionChange={onSettingsSectionChange}
            onDeleted={onDeleted}
          />
        )}
      </div>
    </div>
  );
}
