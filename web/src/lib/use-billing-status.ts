import { useBillingStatusQuery } from "@/lib/queries/billing";

export const useBillingStatus = () => {
  const query = useBillingStatusQuery();
  return {
    billing: query.data ?? null,
    isPro: query.data?.isPro ?? false,
    isLoading: query.isPending,
  };
};
