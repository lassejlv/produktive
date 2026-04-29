import { useEffect, useState } from "react";
import { getBillingStatus, type BillingStatus } from "@/lib/api";

type State = {
  data: BillingStatus | null;
  status: "initial" | "loading" | "ready" | "error";
};

let cache: State = { data: null, status: "initial" };
const subscribers = new Set<() => void>();
let inflight: Promise<void> | null = null;

const notify = () => {
  for (const fn of subscribers) fn();
};

const fetchBilling = async () => {
  cache = { ...cache, status: "loading" };
  notify();
  try {
    const data = await getBillingStatus();
    cache = { data, status: "ready" };
  } catch {
    cache = { data: null, status: "error" };
  }
  notify();
};

export const refreshBillingStatus = (): Promise<void> => {
  if (!inflight) {
    inflight = fetchBilling().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const useBillingStatus = () => {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const handler = () => forceRender((tick) => tick + 1);
    subscribers.add(handler);
    if (cache.status === "initial") {
      void refreshBillingStatus();
    }
    return () => {
      subscribers.delete(handler);
    };
  }, []);

  return {
    billing: cache.data,
    isPro: cache.data?.isPro ?? false,
    isLoading: cache.status === "initial" || cache.status === "loading",
  };
};
