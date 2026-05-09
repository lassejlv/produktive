import { request } from "./client";

export type BillingPlan = "pro";

export type BillingCheckoutResponse = {
  url: string;
};

export type PricingPlan = {
  id: string;
  name: string;
  price: number | null;
  pricingModel: string;
  cadence: string;
  checkoutEnabled?: boolean;
  description: string;
  recommended?: boolean;
  features: string[];
  limits: Record<string, string | number | boolean>;
  ai?: {
    usageLimit: string;
    modelAccess: string;
    models: string[];
  };
  integrations?: Record<string, string | boolean>;
  security?: Record<string, string | boolean>;
};

export type PricingAiPolicy = {
  publicLanguage: string;
  overagePolicy: string;
};

export type PricingModelTier = {
  id: string;
  label: string;
  includedIn: string[];
  intendedUse: string;
};

export type PricingResponse = {
  currency: string;
  positioning: string;
  plans: PricingPlan[];
  aiLimitPolicy: PricingAiPolicy;
  modelTiers: PricingModelTier[];
};

export function createBillingCheckout(plan: BillingPlan) {
  return request<BillingCheckoutResponse>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export async function fetchPricing(): Promise<PricingResponse> {
  return request<PricingResponse>("/api/pricing");
}
