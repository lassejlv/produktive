import { Sheet, SheetPopup } from "#/components/ui/sheet";
import type { SandboxDetailTab } from "#/lib/sandboxes";
import type { DeploySandbox } from "#/lib/types";
import { SandboxDetail } from "./SandboxDetail";

export function SandboxSheet({
  open,
  wid,
  sandbox,
  tab,
  onClose,
  onTabChange,
}: {
  open: boolean;
  wid: string;
  sandbox: DeploySandbox | null;
  tab: SandboxDetailTab;
  onClose: () => void;
  onTabChange: (tab: SandboxDetailTab) => void;
}) {
  if (!sandbox) return null;

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
        <SandboxDetail
          wid={wid}
          sandbox={sandbox}
          tab={tab}
          onTabChange={onTabChange}
          onDeleted={onClose}
        />
      </SheetPopup>
    </Sheet>
  );
}
