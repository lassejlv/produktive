import type { DeployDetailTab } from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { DeployServiceDetail } from "./DeployServiceDetail";

/**
 * Inline service detail rail — sits beside the canvas (Railway-style), not a modal sheet.
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
      className="deploy-service-rail flex min-h-0 w-full shrink-0 flex-col border-[var(--color-border)] bg-[var(--color-bg-elev)] max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:max-w-lg max-md:border-l max-md:shadow-[var(--shadow-pop)] md:w-[min(58%,42rem)] md:border-l"
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
