import type { DeployDetailTab } from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { cn } from "#/lib/cn";
import { DeployServiceDetail } from "./DeployServiceDetail";

/**
 * Inline service detail rail — inset floating panel beside the canvas (Railway-style).
 */
export function DeployServiceRail({
  wid,
  service,
  tab,
  onClose,
  onTabChange,
}: {
  wid: string;
  service: DeployService;
  tab: DeployDetailTab;
  onClose: () => void;
  onTabChange: (tab: DeployDetailTab) => void;
}) {
  return (
    <aside
      className={cn(
        "deploy-service-rail flex min-h-0 shrink-0 flex-col overflow-hidden",
        "border border-[var(--color-border)] bg-[var(--color-bg-elev)]",
        "max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-full max-md:max-w-lg",
        "max-md:border-l max-md:shadow-[var(--shadow-pop)]",
        "md:mb-3 md:mr-3 md:mt-3 md:w-[min(42rem,50%)] md:max-h-[calc(100%-1.5rem)]",
        "md:rounded-[var(--radius-lg)] md:shadow-[var(--shadow-md)]",
      )}
      aria-label={`${service.name} details`}
    >
      <DeployServiceDetail
        wid={wid}
        service={service}
        tab={tab}
        onTabChange={onTabChange}
        onClose={onClose}
        onDeleted={onClose}
      />
    </aside>
  );
}
