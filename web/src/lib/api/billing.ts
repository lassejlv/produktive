import { request } from "./client";

export type BillingPlan = "pro";

export type BillingCheckoutResponse = {
  url: string;
};

export function createBillingCheckout(plan: BillingPlan) {
  return request<BillingCheckoutResponse>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}
