import { queryOptions, useQuery } from "@tanstack/react-query";
import { type BillingStatus, getBillingStatus, getPricingPlans } from "../api";
import { queryKeys } from "./keys";

export const billingStatusQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.billing.status,
    queryFn: getBillingStatus,
    staleTime: 5 * 60_000,
  });

export const pricingPlansQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.billing.plans,
    queryFn: () => getPricingPlans().then((r) => r.plans),
    staleTime: 60 * 60_000,
  });

export const useBillingStatusQuery = () => useQuery(billingStatusQueryOptions());

export const usePricingPlansQuery = () => useQuery(pricingPlansQueryOptions());

export type { BillingStatus };
