import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, auth } from "./api";
import type {
  BillingAction,
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingSetupPaymentResponse,
  BillingSummary,
} from "./billing";
import type {
  AdminRegion,
  AuthResponse,
  Check,
  IncidentUpdateStatus,
  CustomDomain,
  Incident,
  Monitor,
  Notification,
  NotificationChannel,
  OkResponse,
  PublicStatus,
  Region,
  Stats,
  User,
  Workspace,
  WorkspacePatch,
  CreateMonitorBody,
} from "./types";
import type { PublicPricingResponse } from "./pricing";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export const meQuery = {
  queryKey: ["me"] as const,
  queryFn: () => api.get<User>("/auth/me"),
};

export function useMe() {
  return useQuery(meQuery);
}

export const workspacesQuery = {
  queryKey: ["workspaces"] as const,
  queryFn: () => api.get<Workspace[]>("/workspaces"),
};

export function useWorkspaces() {
  return useQuery(workspacesQuery);
}

export function monitorsQuery(wid: string) {
  return {
    queryKey: ["monitors", wid] as const,
    queryFn: () => api.get<Monitor[]>(`/workspaces/${wid}/monitors`),
    refetchInterval: 15_000,
  };
}

export function useMonitors(wid: string) {
  return useQuery(monitorsQuery(wid));
}

export const regionsQuery = (wid: string) => ({
  queryKey: ["regions", wid] as const,
  queryFn: () => api.get<Region[]>(`/workspaces/${wid}/regions`),
});

export function useRegions(wid: string) {
  return useQuery(regionsQuery(wid));
}

export const adminRegionsQuery = {
  queryKey: ["admin", "regions"] as const,
  queryFn: () => api.get<AdminRegion[]>("/admin/regions"),
  refetchInterval: 15_000,
};

export function useAdminRegions(enabled = true) {
  return useQuery({ ...adminRegionsQuery, enabled });
}

export function useUpdateAdminRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; enabled?: boolean }) =>
      api.patch<AdminRegion>(`/admin/regions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "regions"] });
      qc.invalidateQueries({ queryKey: ["regions"] });
    },
  });
}

export function useDeleteAdminRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/admin/regions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "regions"] });
      qc.invalidateQueries({ queryKey: ["regions"] });
    },
  });
}

export function useMonitor(wid: string, mid: string) {
  return useQuery({
    queryKey: ["monitor", wid, mid] as const,
    queryFn: () => api.get<Monitor>(`/workspaces/${wid}/monitors/${mid}`),
    refetchInterval: 15_000,
  });
}

export function useChecks(wid: string, mid: string, limit = 50, region?: string) {
  return useQuery({
    queryKey: ["checks", wid, mid, limit, region ?? "all"] as const,
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (region && region !== "all") params.set("region", region);
      return api.get<Check[]>(`/workspaces/${wid}/monitors/${mid}/checks?${params}`);
    },
    refetchInterval: 15_000,
  });
}

export function useStats(wid: string, mid: string, window = "24h", region?: string) {
  return useQuery({
    queryKey: ["stats", wid, mid, window, region ?? "all"] as const,
    queryFn: () => {
      const params = new URLSearchParams({ window });
      if (region && region !== "all") params.set("region", region);
      return api.get<Stats>(`/workspaces/${wid}/monitors/${mid}/stats?${params}`);
    },
    refetchInterval: 30_000,
  });
}

export function incidentsQuery(wid: string, status: "all" | "open" | "resolved" = "all") {
  return {
    queryKey: ["incidents", wid, status] as const,
    queryFn: () => api.get<Incident[]>(`/workspaces/${wid}/incidents?status=${status}`),
    refetchInterval: 15_000,
  };
}

export function useIncidents(wid: string, status: "all" | "open" | "resolved" = "all") {
  return useQuery(incidentsQuery(wid, status));
}

export interface CreateIncidentInput {
  title: string;
  message: string;
  severity: "down" | "degraded";
}

export interface AddIncidentUpdateInput {
  incidentId: string;
  message: string;
  status: Exclude<IncidentUpdateStatus, "unknown">;
}

export function useCreateIncident(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIncidentInput) =>
      api.post<Incident>(`/workspaces/${wid}/incidents`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents", wid] });
      qc.invalidateQueries({ queryKey: ["public-status"] });
    },
  });
}

export function useAddIncidentUpdate(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, ...body }: AddIncidentUpdateInput) =>
      api.post<Incident>(`/workspaces/${wid}/incidents/${incidentId}/updates`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents", wid] });
      qc.invalidateQueries({ queryKey: ["public-status"] });
    },
  });
}

export const notificationsQuery = (wid: string) => ({
  queryKey: ["notifications", wid] as const,
  queryFn: () => api.get<Notification[]>(`/workspaces/${wid}/notifications`),
  refetchInterval: 15_000,
});

export function useNotifications(wid: string) {
  return useQuery(notificationsQuery(wid));
}

export const notificationChannelsQuery = (wid: string) => ({
  queryKey: ["notification-channels", wid] as const,
  queryFn: () => api.get<NotificationChannel[]>(`/workspaces/${wid}/notifications/channels`),
});

export function useNotificationChannels(wid: string) {
  return useQuery(notificationChannelsQuery(wid));
}

export function useCreateNotificationChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      webhook_url: string;
      kind?: "webhook" | "slack" | "discord";
      enabled?: boolean;
      notify_resolved?: boolean;
    }) => api.post<NotificationChannel>(`/workspaces/${wid}/notifications/channels`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-channels", wid] }),
  });
}

export function useDeleteNotificationChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/notifications/channels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-channels", wid] }),
  });
}

export const customDomainsQuery = (wid: string) => ({
  queryKey: ["custom-domains", wid] as const,
  queryFn: () => api.get<CustomDomain[]>(`/workspaces/${wid}/custom-domains`),
});

export function useCustomDomains(wid: string) {
  return useQuery(customDomainsQuery(wid));
}

export function useCreateCustomDomain(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostname: string) =>
      api.post<CustomDomain>(`/workspaces/${wid}/custom-domains`, { hostname }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-domains", wid] }),
  });
}

export function useVerifyCustomDomain(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<CustomDomain>(`/workspaces/${wid}/custom-domains/${id}/verify`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-domains", wid] }),
  });
}

export function useDeleteCustomDomain(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<OkResponse>(`/workspaces/${wid}/custom-domains/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-domains", wid] }),
  });
}

export function billingSummaryQuery(wid: string) {
  return {
    queryKey: ["billing", wid, "summary"] as const,
    queryFn: () => api.get<BillingSummary>(`/workspaces/${wid}/billing/summary`),
    retry: false,
  };
}

export function useBillingSummary(wid: string) {
  return useQuery(billingSummaryQuery(wid));
}

export function useBillingAttach(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      api.post<BillingCheckoutResponse>(`/workspaces/${wid}/billing/attach`, {
        plan_id: planId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", wid] });
      qc.invalidateQueries({ queryKey: ["billing", wid, "summary"] });
    },
  });
}

export function useBillingPortal(wid: string) {
  return useMutation({
    mutationFn: () => api.post<BillingPortalResponse>(`/workspaces/${wid}/billing/portal`, {}),
  });
}

export function useBillingSetupPayment(wid: string) {
  return useMutation({
    mutationFn: () =>
      api.post<BillingSetupPaymentResponse>(`/workspaces/${wid}/billing/setup-payment`, {}),
  });
}

export function useBillingCancel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>(`/workspaces/${wid}/billing/cancel`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", wid] });
    },
  });
}

export function useBillingRenew(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>(`/workspaces/${wid}/billing/renew`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", wid] });
    },
  });
}

export function useBillingCancelDowngrade(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>(`/workspaces/${wid}/billing/cancel-downgrade`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", wid] });
    },
  });
}

export function useBillingActions(wid: string) {
  const cancel = useBillingCancel(wid);
  const renew = useBillingRenew(wid);
  const cancelDowngrade = useBillingCancelDowngrade(wid);
  const pending = cancel.isPending || renew.isPending || cancelDowngrade.isPending;
  function mutationFor(action: BillingAction) {
    if (action === "cancel") return cancel;
    if (action === "renew") return renew;
    return cancelDowngrade;
  }
  return { pending, mutationFor };
}

export interface DslError {
  message: string;
  line: number;
  col: number;
}

export interface DslValidateResponse {
  ok: boolean;
  ast?: unknown;
  error?: DslError;
  diagnostics?: Array<
    DslError & {
      severity: "error" | "warning";
    }
  >;
}

export interface DslTestOutcome {
  kind: "ok" | "warn" | "down";
  message?: string;
  rule_index?: number;
}

export interface DslTestResponse {
  ok: boolean;
  outcome?: DslTestOutcome;
  error?: DslError;
}

export function useValidateDsl(wid: string) {
  return useMutation({
    mutationFn: (source: string) =>
      api.post<DslValidateResponse>(`/workspaces/${wid}/monitors/dsl/validate`, { source }),
  });
}

export function useTestDsl(wid: string, mid: string) {
  return useMutation({
    mutationFn: (body: { source: string; sample?: unknown }) =>
      api.post<DslTestResponse>(`/workspaces/${wid}/monitors/${mid}/dsl/test`, body),
  });
}

export function useUpdateMonitor(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Monitor> }) =>
      api.patch<Monitor>(`/workspaces/${wid}/monitors/${id}`, patch),
    onSuccess: (m) => {
      qc.setQueryData<Monitor[]>(["monitors", wid], (old) =>
        old?.map((x) => (x.id === m.id ? m : x)),
      );
      qc.setQueryData(["monitor", wid, m.id], m);
      qc.setQueryData(["monitor", wid, m.slug], m);
    },
  });
}

export function useCreateMonitor(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMonitorBody) => api.post<Monitor>(`/workspaces/${wid}/monitors`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitors", wid] }),
  });
}

export function useDeleteMonitor(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<OkResponse>(`/workspaces/${wid}/monitors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitors", wid] });
      qc.removeQueries({ queryKey: ["monitor", wid] });
    },
  });
}

export function useUpdateWorkspace(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WorkspacePatch) => api.patch<Workspace>(`/workspaces/${wid}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useDeleteWorkspace(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<OkResponse>(`/workspaces/${wid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function usePublicStatus(slug: string) {
  return useQuery({
    queryKey: ["public-status", slug] as const,
    queryFn: () => api.get<PublicStatus>(`/public/status/${slug}`),
    refetchInterval: 30_000,
  });
}

export function usePublicStatusByDomain(domain: string) {
  return useQuery({
    queryKey: ["public-status-domain", domain] as const,
    queryFn: () => api.get<PublicStatus>(`/public/status/by-domain/${encodeURIComponent(domain)}`),
    enabled: domain.length > 0,
    refetchInterval: 30_000,
  });
}

export function usePublicPricing() {
  return useQuery({
    queryKey: ["pricing", "public"] as const,
    queryFn: () => api.get<PublicPricingResponse>("/pricing/public"),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<AuthResponse>("/auth/login", body),
    onSuccess: (r) => {
      auth.set(r.token);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<{ user: { id: string; email: string }; personal_workspace_id: string }>(
        "/auth/register",
        body,
      ),
  });
}
