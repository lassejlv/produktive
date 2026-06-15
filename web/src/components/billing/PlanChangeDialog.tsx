import { Check } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "../Dialog";
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
            <Button
              type="button"
              variant="default"
              disabled={pending || !plan}
              loading={pending}
              onClick={onConfirm}
            >
              {changeKind === "downgrade" ? "Confirm downgrade" : "Confirm change"}
            </Button>
          </>
        }
      >
        {plan && (
          <div className="space-y-3">
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

            {plan.items && plan.items.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                  Includes
                </div>
                <div className="max-h-[220px] space-y-2 overflow-y-auto">
                  {plan.items.map((item) => (
                    <div
                      key={item.feature_id}
                      className="flex items-start gap-2 text-[12px] text-[var(--color-fg-muted)]"
                    >
                      <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                      <span>
                        {item.primary_text ?? item.feature_id}
                        {item.secondary_text && (
                          <span className="text-[var(--color-fg-dim)]"> · {item.secondary_text}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
