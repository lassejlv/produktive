import { Sheet, SheetPopup } from "#/components/ui/sheet";
import type { DeployDetailTab } from "#/lib/deployments";
import type { DeployService } from "#/lib/types";
import { DeployServiceDetail } from "./DeployServiceDetail";

export function DeployServiceSheet({
  open,
  wid,
  service,
  tab,
  onClose,
  onTabChange,
}: {
  open: boolean;
  wid: string;
  service: DeployService | null;
  tab: DeployDetailTab;
  onClose: () => void;
  onTabChange: (tab: DeployDetailTab) => void;
}) {
  if (!service) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPopup
        side="right"
        className="flex h-full max-h-full min-h-0 w-full max-w-2xl flex-col border-0 border-s border-[var(--color-border)] bg-[var(--color-bg-elev)] p-0 shadow-none sm:max-w-2xl"
      >
        <DeployServiceDetail
          wid={wid}
          service={service}
          tab={tab}
          onTabChange={onTabChange}
          onDeleted={onClose}
        />
      </SheetPopup>
    </Sheet>
  );
}
