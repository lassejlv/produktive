import { Button } from "../Button";
import { Dialog, DialogClose, DialogContent } from "../Dialog";
import { Spinner } from "../Spinner";
import {
  formatPlanPrice,
  planChangeDescription,
  type BillingPlanSummary,
  type PlanChangeKind,
} from "../../lib/billing";

export function PlanChangeDialog({
  open,
  plan,
  currentPlan,
  changeKind,
  hasActivePaidSubscription,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  plan: BillingPlanSummary | null;
  currentPlan?: BillingPlanSummary;
  changeKind: PlanChangeKind;
  hasActivePaidSubscription: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const title =
    changeKind === "downgrade"
      ? "Confirm downgrade"
      : changeKind === "upgrade"
        ? "Confirm upgrade"
        : "Confirm plan change";
  const currentName = currentPlan?.name ?? "your current plan";
  const nextName = plan?.name ?? "this plan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={planChangeDescription(
          changeKind,
          currentName,
          nextName,
          hasActivePaidSubscription,
        )}
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="primary" disabled={pending || !plan} onClick={onConfirm}>
              {pending && <Spinner size={12} thickness={2} />}
              {changeKind === "downgrade" ? "Confirm downgrade" : "Confirm change"}
            </Button>
          </>
        }
      >
        {plan && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">New plan</span>
              <span className="text-[13px] font-medium text-[var(--color-fg)]">{plan.name}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">Price</span>
              <span className="text-[13px] font-medium text-[var(--color-fg)] tabular">
                {formatPlanPrice(plan.price)}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
