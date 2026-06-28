import type { ReactNode } from "react";
import {
  AlertTriangle,
  Globe,
  Gauge,
  GitBranch,
  Network,
} from "lucide-react";
import { cn } from "#/lib/cn";
import {
  DEFAULT_DEPLOY_SETTINGS_SECTION,
  type DeploySettingsSection,
} from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { DomainsPanel, VolumesSection } from "./DeployServicePanels";
import { DangerZoneSection, ScaleSection, SourceSection } from "./DeployServiceSettingsSections";

const SETTINGS_NAV: Array<{
  id: DeploySettingsSection;
  label: string;
  icon: typeof GitBranch;
}> = [
  { id: "source", label: "Source", icon: GitBranch },
  { id: "networking", label: "Networking", icon: Network },
  { id: "scale", label: "Scale", icon: Gauge },
  { id: "danger", label: "Danger", icon: AlertTriangle },
];

export function DeployServiceSettings({
  wid,
  service,
  section = DEFAULT_DEPLOY_SETTINGS_SECTION,
  onSectionChange,
  onDeleted,
}: {
  wid: string;
  service: DeployService;
  section?: DeploySettingsSection;
  onSectionChange: (section: DeploySettingsSection) => void;
  onDeleted?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:gap-5">
      <div className="min-h-0 flex-1 overflow-y-auto sm:pr-1">
        {section === "source" && <SourceSection wid={wid} service={service} />}
        {section === "networking" && (
          <div className="space-y-6">
            <SettingsBlock title="Domains" icon={Globe}>
              <DomainsPanel wid={wid} service={service} />
            </SettingsBlock>
            <VolumesSection wid={wid} service={service} />
          </div>
        )}
        {section === "scale" && <ScaleSection wid={wid} service={service} />}
        {section === "danger" && (
          <DangerZoneSection wid={wid} service={service} onDeleted={onDeleted} />
        )}
      </div>

      <nav
        className="deploy-settings-nav shrink-0 border-t border-[var(--color-border)] pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0 sm:w-[9.5rem]"
        aria-label="Settings sections"
      >
        <ul className="flex flex-row flex-wrap gap-1 sm:flex-col sm:gap-0.5">
          {SETTINGS_NAV.map((item) => {
            const active = section === item.id;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[12px] transition-colors sm:px-2 sm:py-1.5",
                    active
                      ? "bg-[var(--color-bg-row)] font-medium text-[var(--color-fg)]"
                      : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Icon size={13} className="shrink-0 opacity-70" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function SettingsBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Globe;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-[var(--color-fg-muted)]" />
        <h3 className="text-[13px] font-medium text-[var(--color-fg)]">{title}</h3>
      </div>
      {children}
    </section>
  );
}
