import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "../Dialog";
import type { BillingAction, BillingSummary } from "../../lib/billing";

export function BillingActionDialog({
  action,
  billing,
  pending,
  onOpenChange,
  onConfirm,
}: {
  action: BillingAction | null;
  billing: BillingSummary;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const title =
    action === "cancel"
      ? "Cancel subscription?"
      : action === "renew"
        ? "Renew subscription?"
        : "Cancel scheduled downgrade?";
  const description =
    action === "cancel"
      ? "Your current paid plan will stay active until the end of the current billing month, then the workspace will return to the free plan."
      : action === "renew"
        ? "This removes the pending cancellation and keeps your current paid plan active."
        : `This removes the scheduled downgrade${billing.scheduled_plan_name ? ` to ${billing.scheduled_plan_name}` : ""} and keeps your current plan active.`;
  const confirmLabel =
    action === "cancel"
      ? "Cancel at period end"
      : action === "renew"
        ? "Renew plan"
        : "Cancel downgrade";

  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Back
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={action === "cancel" ? "destructive" : "default"}
              disabled={pending || !action}
              loading={pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
