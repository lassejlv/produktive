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
  AdminLogAccessRequest,
  AdminLogBucket,
  AdminRegion,
  AdminUsageResetResult,
  AdminWorkspaceUsage,
  AuthResponse,
  Check,
  LogAccess,
  IncidentUpdateStatus,
  CustomDomain,
  Incident,
  IncidentSeverity,
  LatencyPoint,
  CreatedLogIngestToken,
  LogAlertRule,
  LogIngestToken,
  LogProject,
  LogSearchResponse,
  Monitor,
  Notification,
  NotificationChannel,
  NotificationDelivery,
  OkResponse,
  PublicStatus,
  Region,
  Stats,
  User,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspacePatch,
  CreateMonitorBody,
  UpdateMonitorBody,
  InviteCreated,
  InvitePreview,
  WorkspaceRole,
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

export interface AuthConfig {
  github_enabled: boolean;
}

export const authConfigQuery = {
  queryKey: ["auth-config"] as const,
  queryFn: () => api.get<AuthConfig>("/auth/config"),
};

export function useAuthConfig() {
  return useQuery(authConfigQuery);
}

export const workspacesQuery = {
  queryKey: ["workspaces"] as const,
  queryFn: () => api.get<Workspace[]>("/workspaces"),
};

export function useWorkspaces() {
  return useQuery(workspacesQuery);
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.post<Workspace>("/workspaces", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
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

export const adminLogBucketsQuery = {
  queryKey: ["admin", "log-buckets"] as const,
  queryFn: () => api.get<AdminLogBucket[]>("/admin/log-buckets"),
};

export function useAdminLogBuckets(enabled = true) {
  return useQuery({ ...adminLogBucketsQuery, enabled });
}

export interface CreateLogBucketInput {
  name: string;
  storage_uri: string;
  region?: string | null;
  endpoint?: string | null;
  access_key_id?: string | null;
  secret_access_key?: string | null;
  enabled?: boolean;
  max_projects?: number;
}

export type UpdateLogBucketInput = Partial<CreateLogBucketInput> & { id: string };

export function useCreateLogBucket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLogBucketInput) =>
      api.post<AdminLogBucket>("/admin/log-buckets", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "log-buckets"] }),
  });
}

export function useUpdateLogBucket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateLogBucketInput) =>
      api.patch<AdminLogBucket>(`/admin/log-buckets/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "log-buckets"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
    },
  });
}

export function useDeleteLogBucket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<OkResponse>(`/admin/log-buckets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "log-buckets"] }),
  });
}

export const adminLogAccessRequestsQuery = {
  queryKey: ["admin", "log-access-requests"] as const,
  queryFn: () => api.get<AdminLogAccessRequest[]>("/admin/log-access-requests"),
  refetchInterval: 15_000,
};

export function useAdminLogAccessRequests(enabled = true) {
  return useQuery({ ...adminLogAccessRequestsQuery, enabled });
}

export function useDecideLogAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "denied" }) =>
      api.patch<AdminLogAccessRequest>(`/admin/log-access-requests/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "log-access-requests"] }),
  });
}

export const adminWorkspaceUsageQuery = (ident: string) => ({
  queryKey: ["admin", "workspace-usage", ident] as const,
  queryFn: () =>
    api.get<AdminWorkspaceUsage>(`/admin/workspaces/${encodeURIComponent(ident)}/usage`),
});

export function useAdminWorkspaceUsage(ident: string | null) {
  return useQuery({ ...adminWorkspaceUsageQuery(ident ?? ""), enabled: !!ident });
}

export function useResetWorkspaceUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ident: string) =>
      api.post<AdminUsageResetResult>(
        `/admin/workspaces/${encodeURIComponent(ident)}/usage/reset`,
      ),
    onSuccess: (_result, ident) =>
      qc.invalidateQueries({ queryKey: ["admin", "workspace-usage", ident] }),
  });
}

export function useMonitor(wid: string, mid: string) {
  return useQuery({
    queryKey: ["monitor", wid, mid] as const,
    queryFn: () => api.get<Monitor>(`/workspaces/${wid}/monitors/${mid}`),
    refetchInterval: 15_000,
  });
}

export function useChecks(wid: string, mid: string, limit = 50, region?: string, enabled = true) {
  return useQuery({
    queryKey: ["checks", wid, mid, limit, region ?? "all"] as const,
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (region && region !== "all") params.set("region", region);
      return api.get<Check[]>(`/workspaces/${wid}/monitors/${mid}/checks?${params}`);
    },
    refetchInterval: 15_000,
    enabled,
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

/** Time-bucketed response-time series for the chart, spanning the given window. */
export function useLatencySeries(wid: string, mid: string, window = "24h", region?: string) {
  return useQuery({
    queryKey: ["latency", wid, mid, window, region ?? "all"] as const,
    queryFn: () => {
      const params = new URLSearchParams({ window });
      if (region && region !== "all") params.set("region", region);
      return api.get<LatencyPoint[]>(`/workspaces/${wid}/monitors/${mid}/latency?${params}`);
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
  severity: Exclude<IncidentSeverity, "unknown">;
  monitor_id?: string | null;
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

export function useUpdateNotificationChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      enabled?: boolean;
      notify_resolved?: boolean;
    }) => api.patch<NotificationChannel>(`/workspaces/${wid}/notifications/channels/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-channels", wid] }),
  });
}

export function useTestNotificationChannel(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<OkResponse>(`/workspaces/${wid}/notifications/channels/${id}/test`, {}),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ["notification-channels", wid] });
      qc.invalidateQueries({ queryKey: ["notification-deliveries", wid, id] });
    },
  });
}

export const notificationDeliveriesQuery = (wid: string, channelId: string) => ({
  queryKey: ["notification-deliveries", wid, channelId] as const,
  queryFn: () =>
    api.get<NotificationDelivery[]>(
      `/workspaces/${wid}/notifications/channels/${channelId}/deliveries?limit=10`,
    ),
});

export function useNotificationDeliveries(wid: string, channelId: string | null) {
  return useQuery({
    ...notificationDeliveriesQuery(wid, channelId ?? ""),
    enabled: !!channelId,
  });
}

export const logAccessQuery = (wid: string) => ({
  queryKey: ["logs", wid, "access"] as const,
  queryFn: () => api.get<LogAccess>(`/workspaces/${wid}/logs/access`),
});

export function useLogAccess(wid: string) {
  return useQuery(logAccessQuery(wid));
}

export function useRequestLogAccess(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<LogAccess>(`/workspaces/${wid}/logs/access/request`),
    onSuccess: (data) => qc.setQueryData(["logs", wid, "access"], data),
  });
}

export const logProjectsQuery = (wid: string) => ({
  queryKey: ["logs", wid, "projects"] as const,
  queryFn: () => api.get<LogProject[]>(`/workspaces/${wid}/logs/projects`),
});

export function useLogProjects(wid: string, enabled = true) {
  return useQuery({ ...logProjectsQuery(wid), enabled });
}

export function useCreateLogProject(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug?: string;
      description?: string;
      retention_days?: number;
    }) => api.post<LogProject>(`/workspaces/${wid}/logs/projects`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs", wid, "projects"] }),
  });
}

export function useDeleteLogProject(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/logs/projects/${project}`),
    onSuccess: (_result, project) => {
      qc.setQueryData<LogProject[]>(["logs", wid, "projects"], (current) =>
        current?.filter((item) => item.id !== project && item.slug !== project),
      );
      qc.invalidateQueries({ queryKey: ["logs", wid, "projects"] });
    },
  });
}

export const logTokensQuery = (wid: string, project: string) => ({
  queryKey: ["logs", wid, project, "tokens"] as const,
  queryFn: () => api.get<LogIngestToken[]>(`/workspaces/${wid}/logs/projects/${project}/tokens`),
});

export function useLogTokens(wid: string, project: string | null) {
  return useQuery({ ...logTokensQuery(wid, project ?? ""), enabled: !!project });
}

export function useCreateLogToken(wid: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; expires_at?: string | null }) =>
      api.post<CreatedLogIngestToken>(`/workspaces/${wid}/logs/projects/${project}/tokens`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs", wid, project, "tokens"] }),
  });
}

export function useRevokeLogToken(wid: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/logs/projects/${project}/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs", wid, project, "tokens"] }),
  });
}

export interface LogSearchInput {
  from?: string;
  to?: string;
  q?: string;
  level?: string;
  service?: string;
  limit?: number;
}

export const logSearchQuery = (wid: string, project: string, input: LogSearchInput) => ({
  queryKey: ["logs", wid, project, "events", input] as const,
  queryFn: () => {
    const params = new URLSearchParams();
    if (input.from) params.set("from", input.from);
    if (input.to) params.set("to", input.to);
    if (input.q) params.set("q", input.q);
    if (input.level && input.level !== "all") params.set("level", input.level);
    if (input.service) params.set("service", input.service);
    if (input.limit) params.set("limit", String(input.limit));
    return api.get<LogSearchResponse>(
      `/workspaces/${wid}/logs/projects/${project}/events?${params}`,
    );
  },
});

export function useLogSearch(wid: string, project: string | null, input: LogSearchInput) {
  return useQuery({
    ...logSearchQuery(wid, project ?? "", input),
    enabled: !!project,
    refetchInterval: 15_000,
  });
}

export const logAlertsQuery = (wid: string, project: string) => ({
  queryKey: ["logs", wid, project, "alerts"] as const,
  queryFn: () => api.get<LogAlertRule[]>(`/workspaces/${wid}/logs/projects/${project}/alerts`),
});

export function useLogAlerts(wid: string, project: string | null) {
  return useQuery({ ...logAlertsQuery(wid, project ?? ""), enabled: !!project });
}

export function useCreateLogAlert(wid: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      query?: string;
      level?: string | null;
      threshold_count?: number;
      window_seconds?: number;
      enabled?: boolean;
    }) => api.post<LogAlertRule>(`/workspaces/${wid}/logs/projects/${project}/alerts`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs", wid, project, "alerts"] }),
  });
}

export function useDeleteLogAlert(wid: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/logs/projects/${project}/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs", wid, project, "alerts"] }),
  });
}

export const membersQuery = (wid: string) => ({
  queryKey: ["members", wid] as const,
  queryFn: () => api.get<WorkspaceMember[]>(`/workspaces/${wid}/members`),
});

export function useMembers(wid: string) {
  return useQuery(membersQuery(wid));
}

export function useUpdateMemberRole(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      api.patch<WorkspaceMember>(`/workspaces/${wid}/members/${userId}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", wid] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useRemoveMember(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.del<OkResponse>(`/workspaces/${wid}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", wid] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["billing", wid] });
      qc.invalidateQueries({ queryKey: ["billing", wid, "summary"] });
    },
  });
}

export const invitesQuery = (wid: string) => ({
  queryKey: ["invites", wid] as const,
  queryFn: () => api.get<WorkspaceInvite[]>(`/workspaces/${wid}/invites`),
});

export function useInvites(wid: string, enabled = true) {
  return useQuery({ ...invitesQuery(wid), enabled });
}

export function useCreateInvite(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role?: WorkspaceRole }) =>
      api.post<InviteCreated>(`/workspaces/${wid}/invites`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", wid] });
      qc.invalidateQueries({ queryKey: ["billing", wid] });
      qc.invalidateQueries({ queryKey: ["billing", wid, "summary"] });
    },
  });
}

export function useRevokeInvite(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<OkResponse>(`/workspaces/${wid}/invites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", wid] });
      qc.invalidateQueries({ queryKey: ["billing", wid] });
      qc.invalidateQueries({ queryKey: ["billing", wid, "summary"] });
    },
  });
}

export const invitePreviewQuery = (token: string) => ({
  queryKey: ["invite", token] as const,
  queryFn: () => api.get<InvitePreview>(`/invites/${token}`),
  retry: false,
});

export function useInvitePreview(token: string) {
  return useQuery(invitePreviewQuery(token));
}

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OkResponse>(`/invites/${token}/accept`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["invite", token] });
    },
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
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMonitorBody }) =>
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
