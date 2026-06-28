import type { DeployDetailTab, DeploySettingsSection } from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { cn } from "#/lib/cn";
import { DeployServiceDetail } from "./DeployServiceDetail";

/**
 * Service detail panel overlaid on the canvas (Railway-style) — canvas stays full bleed behind.
 */
export function DeployServiceRail({
  wid,
  service,
  tab,
  settingsSection,
  onClose,
  onTabChange,
  onSettingsSectionChange,
}: {
  wid: string;
  service: DeployService;
  tab: DeployDetailTab;
  settingsSection: DeploySettingsSection;
  onClose: () => void;
  onTabChange: (tab: DeployDetailTab) => void;
  onSettingsSectionChange: (section: DeploySettingsSection) => void;
}) {
  return (
    <aside
      className={cn(
        "deploy-service-rail flex min-h-0 flex-col overflow-hidden",
        "border border-[var(--color-border)] bg-[var(--color-bg-elev)]",
        "max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-full max-md:max-w-lg",
        "max-md:border-l max-md:shadow-[var(--shadow-pop)]",
        "md:absolute md:bottom-3 md:right-3 md:top-3 md:z-20 md:min-h-0",
        "md:w-[min(42rem,46%)] md:rounded-[var(--radius-lg)] md:shadow-[var(--shadow-pop)]",
      )}
      aria-label={`${service.name} details`}
    >
      <DeployServiceDetail
        wid={wid}
        service={service}
        tab={tab}
        settingsSection={settingsSection}
        onTabChange={onTabChange}
        onSettingsSectionChange={onSettingsSectionChange}
        onClose={onClose}
        onDeleted={onClose}
      />
    </aside>
  );
}
