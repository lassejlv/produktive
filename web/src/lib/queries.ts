import {
  QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  AdminDeployAccessRequest,
  AdminLogBucket,
  AdminRegion,
  AdminUsageResetResult,
  AdminWorkspaceUsage,
  AuthResponse,
  Check,
  LogAccess,
  DeployAccess,
  DeployEvent,
  Deployment,
  DeployLogLine,
  DeployMetricPoint,
  DeployRegistryCredential,
  DeployRegion,
  DeployRegistryKind,
  DeployResourcePreset,
  DeploySandbox,
  CreatedObjectStorageBucket,
  ObjectStorageBucket,
  DeployService,
  DeployServiceDomain,
  DeployServiceVolume,
  CreatedSandboxApiToken,
  SandboxApiToken,
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
  SandboxCheckpoint,
  SandboxExecResult,
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

export function useAcceptLegalTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<User>("/auth/accept-legal-terms", {}),
    onSuccess: (user) => {
      qc.setQueryData(meQuery.queryKey, user);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

/// Confirm an email address from the link token. Idempotent on the backend; on
/// success the cached `me` is refreshed so the verification gate clears.
export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api.post<{ ok: boolean }>("/auth/verify-email", { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

/// Re-send the verification email to the signed-in user (no body; auth required).
export function useResendVerificationEmail() {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/auth/resend-verification-email", {}),
  });
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

export const adminDeployAccessRequestsQuery = {
  queryKey: ["admin", "deploy-access-requests"] as const,
  queryFn: () => api.get<AdminDeployAccessRequest[]>("/admin/deploy-access-requests"),
};

export function useAdminDeployAccessRequests(enabled = true) {
  return useQuery({ ...adminDeployAccessRequestsQuery, enabled });
}

export function useDecideDeployAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "denied" }) =>
      api.patch<AdminDeployAccessRequest>(`/admin/deploy-access-requests/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "deploy-access-requests"] }),
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
      api.post<AdminUsageResetResult>(`/admin/workspaces/${encodeURIComponent(ident)}/usage/reset`),
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

export const deployAccessQuery = (wid: string) => ({
  queryKey: ["deployments", wid, "access"] as const,
  queryFn: () => api.get<DeployAccess>(`/workspaces/${wid}/deployments/access`),
});

export function useDeployAccess(wid: string) {
  return useQuery(deployAccessQuery(wid));
}

export function useRequestDeployAccess(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DeployAccess>(`/workspaces/${wid}/deployments/access/request`),
    onSuccess: (data) => qc.setQueryData(["deployments", wid, "access"], data),
  });
}

export const deployServicesQuery = (wid: string) => ({
  queryKey: ["deployments", wid, "services"] as const,
  queryFn: () => api.get<DeployService[]>(`/workspaces/${wid}/deployments/services`),
  refetchInterval: 15_000,
});

export function useDeployServices(wid: string, enabled = true) {
  return useQuery({ ...deployServicesQuery(wid), enabled });
}

export const deployRegionsQuery = (wid: string) => ({
  queryKey: ["deployments", wid, "regions"] as const,
  queryFn: () => api.get<DeployRegion[]>(`/workspaces/${wid}/deployments/regions`),
  staleTime: 5 * 60_000,
});

export function useDeployRegions(wid: string, enabled = true) {
  return useQuery({ ...deployRegionsQuery(wid), enabled });
}

export const deployCredentialsQuery = (wid: string) => ({
  queryKey: ["deployments", wid, "registry-credentials"] as const,
  queryFn: () =>
    api.get<DeployRegistryCredential[]>(`/workspaces/${wid}/deployments/registry-credentials`),
});

export function useDeployCredentials(wid: string, enabled = true) {
  return useQuery({ ...deployCredentialsQuery(wid), enabled });
}

export function useCreateDeployCredential(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      registry_kind: DeployRegistryKind;
      username: string;
      password: string;
    }) =>
      api.post<DeployRegistryCredential>(
        `/workspaces/${wid}/deployments/registry-credentials`,
        body,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["deployments", wid, "registry-credentials"] }),
  });
}

export function useCreateDeployService(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      provider?: "fly" | "cloud_run";
      image?: string;
      registry_kind?: DeployRegistryKind;
      source_kind?: "image" | "git";
      git_url?: string;
      git_ref?: string;
      dockerfile_path?: string;
      root_dir?: string;
      registry_credential_id?: string | null;
      internal_port: number;
      env?: Record<string, string>;
      secrets?: Record<string, string>;
      environment?: string;
      health_check_path?: string;
      region?: string;
      resource_preset?: DeployResourcePreset;
      machine_count?: number;
    }) => api.post<DeployService>(`/workspaces/${wid}/deployments/services`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments", wid] }),
  });
}

export function useUpdateDeployService(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      resource_preset,
      machine_count,
      canvas_x,
      canvas_y,
    }: {
      serviceId: string;
      resource_preset?: DeployResourcePreset;
      machine_count?: number;
      canvas_x?: number;
      canvas_y?: number;
    }) =>
      api.patch<DeployService>(`/workspaces/${wid}/deployments/services/${serviceId}`, {
        resource_preset,
        machine_count,
        canvas_x,
        canvas_y,
      }),
    onSuccess: (service) => {
      qc.setQueryData<DeployService[]>(["deployments", wid, "services"], (old) =>
        old?.map((item) => (item.id === service.id ? service : item)),
      );
      qc.invalidateQueries({ queryKey: ["deployments", wid, service.id, "events"] });
    },
  });
}

export function useSetServiceEnv(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, env }: { serviceId: string; env: Record<string, string> }) =>
      api.post<DeployService>(`/workspaces/${wid}/deployments/services/${serviceId}/env`, { env }),
    onSuccess: (service) => {
      qc.setQueryData<DeployService[]>(["deployments", wid, "services"], (old) =>
        old?.map((item) => (item.id === service.id ? service : item)),
      );
      qc.invalidateQueries({ queryKey: ["deployments", wid, service.id, "events"] });
    },
  });
}

export function useDeleteDeployService(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/deployments/services/${serviceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments", wid] }),
  });
}

export const deploymentsQuery = (wid: string, serviceId: string) => ({
  queryKey: ["deployments", wid, serviceId, "deployments"] as const,
  queryFn: () =>
    api.get<Deployment[]>(
      `/workspaces/${wid}/deployments/services/${serviceId}/deployments?limit=20`,
    ),
  refetchInterval: 10_000,
});

export function useDeployments(wid: string, serviceId: string | null) {
  return useQuery({ ...deploymentsQuery(wid, serviceId ?? ""), enabled: !!serviceId });
}

export function useCreateDeployment(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, image }: { serviceId: string; image?: string }) =>
      api.post<Deployment>(`/workspaces/${wid}/deployments/services/${serviceId}/deployments`, {
        image,
      }),
    onSuccess: (_deployment, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, "services"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId] });
    },
  });
}

export function useRollbackDeployment(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      api.post<Deployment>(`/workspaces/${wid}/deployments/services/${serviceId}/rollback`),
    onSuccess: (_deployment, serviceId) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, "services"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, serviceId] });
    },
  });
}

export function useCancelDeployment(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      deploymentId,
    }: {
      serviceId: string;
      deploymentId: string;
    }) =>
      api.post<Deployment>(
        `/workspaces/${wid}/deployments/services/${serviceId}/deployments/${deploymentId}/cancel`,
      ),
    onSuccess: (_deployment, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, "services"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "events"] });
    },
  });
}

export function useStopDeployService(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: string) =>
      api.post<DeployService>(`/workspaces/${wid}/deployments/services/${serviceId}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments", wid] }),
  });
}

export const deployServiceVolumesQuery = (wid: string, serviceId: string) => ({
  queryKey: ["deployments", wid, serviceId, "volumes"] as const,
  queryFn: () =>
    api.get<DeployServiceVolume[]>(`/workspaces/${wid}/deployments/services/${serviceId}/volumes`),
  refetchInterval: 15_000,
});

export function useDeployServiceVolumes(wid: string, serviceId: string | null) {
  return useQuery({ ...deployServiceVolumesQuery(wid, serviceId ?? ""), enabled: !!serviceId });
}

export type DeployVolumeWithService = {
  volume: DeployServiceVolume;
  serviceId: string;
};

export function useDeployAllVolumes(wid: string, serviceIds: string[], enabled = true) {
  return useQueries({
    queries: serviceIds.map((serviceId) => ({
      ...deployServiceVolumesQuery(wid, serviceId),
      enabled: enabled && serviceIds.length > 0,
    })),
    combine: (results) => ({
      data: results.flatMap((result, index) =>
        (result.data ?? []).map((volume) => ({
          volume,
          serviceId: serviceIds[index]!,
        })),
      ),
      isLoading: enabled && serviceIds.length > 0 && results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
    }),
  });
}

export function useCreateDeployServiceVolume(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      name,
      mount_path,
      size_gb,
    }: {
      serviceId: string;
      name: string;
      mount_path: string;
      size_gb: number;
    }) =>
      api.post<DeployServiceVolume>(
        `/workspaces/${wid}/deployments/services/${serviceId}/volumes`,
        { name, mount_path, size_gb },
      ),
    onSuccess: (_volume, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "volumes"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "events"] });
    },
  });
}

export function useDeleteDeployServiceVolume(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, volumeId }: { serviceId: string; volumeId: string }) =>
      api.del<OkResponse>(
        `/workspaces/${wid}/deployments/services/${serviceId}/volumes/${volumeId}`,
      ),
    onSuccess: (_response, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "volumes"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "events"] });
    },
  });
}

export function useUpdateDeployServiceVolume(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      serviceId,
      volumeId,
      mount_path,
    }: {
      serviceId: string;
      volumeId: string;
      mount_path: string;
    }) =>
      api.patch<DeployServiceVolume>(
        `/workspaces/${wid}/deployments/services/${serviceId}/volumes/${volumeId}`,
        { mount_path },
      ),
    onSuccess: (_volume, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "volumes"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "events"] });
    },
  });
}

export const deployServiceDomainsQuery = (wid: string, serviceId: string) => ({
  queryKey: ["deployments", wid, serviceId, "domains"] as const,
  queryFn: () =>
    api.get<DeployServiceDomain[]>(`/workspaces/${wid}/deployments/services/${serviceId}/domains`),
  refetchInterval: 15_000,
});

export function useDeployServiceDomains(wid: string, serviceId: string | null) {
  return useQuery({ ...deployServiceDomainsQuery(wid, serviceId ?? ""), enabled: !!serviceId });
}

export function useCreateDeployServiceDomain(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, hostname }: { serviceId: string; hostname: string }) =>
      api.post<DeployServiceDomain>(
        `/workspaces/${wid}/deployments/services/${serviceId}/domains`,
        { hostname },
      ),
    onSuccess: (_domain, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "domains"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "events"] });
    },
  });
}

export function useVerifyDeployServiceDomain(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, domainId }: { serviceId: string; domainId: string }) =>
      api.post<DeployServiceDomain>(
        `/workspaces/${wid}/deployments/services/${serviceId}/domains/${domainId}/verify`,
      ),
    onSuccess: (_domain, input) =>
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "domains"] }),
  });
}

export function useDeleteDeployServiceDomain(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, domainId }: { serviceId: string; domainId: string }) =>
      api.del<OkResponse>(
        `/workspaces/${wid}/deployments/services/${serviceId}/domains/${domainId}`,
      ),
    onSuccess: (_response, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "domains"] });
      qc.invalidateQueries({ queryKey: ["deployments", wid, input.serviceId, "events"] });
    },
  });
}

export const deployEventsQuery = (wid: string, serviceId: string, deploymentId?: string | null) => ({
  queryKey: ["deployments", wid, serviceId, "events", deploymentId ?? "all"] as const,
  queryFn: () => {
    const params = new URLSearchParams({ limit: "50" });
    if (deploymentId) params.set("deployment_id", deploymentId);
    return api.get<DeployEvent[]>(
      `/workspaces/${wid}/deployments/services/${serviceId}/events?${params}`,
    );
  },
  refetchInterval: 10_000,
});

export function useDeployEvents(
  wid: string,
  serviceId: string | null,
  deploymentId?: string | null,
) {
  return useQuery({
    ...deployEventsQuery(wid, serviceId ?? "", deploymentId),
    enabled: !!serviceId,
  });
}

export const deployLogsQuery = (wid: string, serviceId: string, deploymentId?: string | null) => ({
  queryKey: ["deployments", wid, serviceId, "logs", deploymentId ?? "all"] as const,
  queryFn: () => {
    const params = new URLSearchParams({ limit: "100" });
    if (deploymentId) params.set("deployment_id", deploymentId);
    return api.get<DeployLogLine[]>(
      `/workspaces/${wid}/deployments/services/${serviceId}/logs?${params}`,
    );
  },
  refetchInterval: 10_000,
});

export function useDeployLogs(
  wid: string,
  serviceId: string | null,
  deploymentId?: string | null,
) {
  return useQuery({
    ...deployLogsQuery(wid, serviceId ?? "", deploymentId),
    enabled: !!serviceId,
  });
}

export const deployBuildLogsQuery = (
  wid: string,
  serviceId: string,
  deploymentId?: string | null,
) => ({
  queryKey: ["deployments", wid, serviceId, "build-logs", deploymentId ?? "all"] as const,
  queryFn: () => {
    const params = new URLSearchParams({ limit: "200" });
    if (deploymentId) params.set("deployment_id", deploymentId);
    return api.get<DeployLogLine[]>(
      `/workspaces/${wid}/deployments/services/${serviceId}/build-logs?${params}`,
    );
  },
  refetchInterval: 10_000,
});

export function useDeployBuildLogs(
  wid: string,
  serviceId: string | null,
  deploymentId?: string | null,
) {
  return useQuery({
    ...deployBuildLogsQuery(wid, serviceId ?? "", deploymentId),
    enabled: !!serviceId,
  });
}

export const deployMetricsQuery = (wid: string, serviceId: string) => ({
  queryKey: ["deployments", wid, serviceId, "metrics"] as const,
  queryFn: () =>
    api.get<DeployMetricPoint[]>(`/workspaces/${wid}/deployments/services/${serviceId}/metrics`),
  refetchInterval: 15_000,
});

export function useDeployMetrics(wid: string, serviceId: string | null) {
  return useQuery({ ...deployMetricsQuery(wid, serviceId ?? ""), enabled: !!serviceId });
}

export const deploySandboxesQuery = (wid: string) => ({
  queryKey: ["deployments", wid, "sandboxes"] as const,
  queryFn: () => api.get<DeploySandbox[]>(`/workspaces/${wid}/deployments/sandboxes`),
  refetchInterval: 15_000,
});

export function useDeploySandboxes(wid: string, enabled = true) {
  return useQuery({ ...deploySandboxesQuery(wid), enabled });
}

export const deploySandboxQuery = (wid: string, sandboxId: string) => ({
  queryKey: ["deployments", wid, "sandboxes", sandboxId] as const,
  queryFn: () =>
    api.get<DeploySandbox>(`/workspaces/${wid}/deployments/sandboxes/${sandboxId}`),
  refetchInterval: 10_000,
});

export function useDeploySandbox(wid: string, sandboxId: string | null, enabled = true) {
  return useQuery({
    ...deploySandboxQuery(wid, sandboxId ?? ""),
    enabled: enabled && !!sandboxId,
  });
}

export function useCreateDeploySandbox(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug?: string;
      region?: string;
      cpus?: number;
      ram_mb?: number;
      storage_gb?: number;
    }) => api.post<DeploySandbox>(`/workspaces/${wid}/deployments/sandboxes`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments", wid, "sandboxes"] }),
  });
}

export function useUpdateDeploySandbox(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sandboxId,
      name,
    }: {
      sandboxId: string;
      name?: string;
    }) =>
      api.patch<DeploySandbox>(`/workspaces/${wid}/deployments/sandboxes/${sandboxId}`, {
        name,
      }),
    onSuccess: (sandbox) => {
      qc.setQueryData<DeploySandbox[]>(["deployments", wid, "sandboxes"], (old) =>
        old?.map((item) => (item.id === sandbox.id ? sandbox : item)),
      );
      qc.setQueryData(["deployments", wid, "sandboxes", sandbox.id], sandbox);
    },
  });
}

export function useDeleteDeploySandbox(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sandboxId: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/deployments/sandboxes/${sandboxId}`),
    onSuccess: (_response, sandboxId) => {
      qc.setQueryData<DeploySandbox[]>(["deployments", wid, "sandboxes"], (old) =>
        old?.filter((item) => item.id !== sandboxId),
      );
      qc.removeQueries({ queryKey: ["deployments", wid, "sandboxes", sandboxId] });
    },
  });
}

export function useExecDeploySandbox(wid: string) {
  return useMutation({
    mutationFn: ({
      sandboxId,
      command,
      args,
      cwd,
    }: {
      sandboxId: string;
      command: string;
      args?: string[];
      cwd?: string;
    }) =>
      api.post<SandboxExecResult>(
        `/workspaces/${wid}/deployments/sandboxes/${sandboxId}/exec`,
        { command, args: args ?? [], cwd },
      ),
  });
}

export const deploySandboxCheckpointsQuery = (wid: string, sandboxId: string) => ({
  queryKey: ["deployments", wid, "sandboxes", sandboxId, "checkpoints"] as const,
  queryFn: () =>
    api.get<SandboxCheckpoint[]>(
      `/workspaces/${wid}/deployments/sandboxes/${sandboxId}/checkpoints`,
    ),
});

export function useDeploySandboxCheckpoints(wid: string, sandboxId: string | null) {
  return useQuery({
    ...deploySandboxCheckpointsQuery(wid, sandboxId ?? ""),
    enabled: !!sandboxId,
  });
}

export function useCreateDeploySandboxCheckpoint(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sandboxId, comment }: { sandboxId: string; comment?: string }) =>
      api.post<SandboxCheckpoint>(
        `/workspaces/${wid}/deployments/sandboxes/${sandboxId}/checkpoints`,
        { comment },
      ),
    onSuccess: (_checkpoint, input) => {
      qc.invalidateQueries({
        queryKey: ["deployments", wid, "sandboxes", input.sandboxId, "checkpoints"],
      });
    },
  });
}

export function useRestoreDeploySandboxCheckpoint(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sandboxId, checkpointId }: { sandboxId: string; checkpointId: string }) =>
      api.post<OkResponse>(
        `/workspaces/${wid}/deployments/sandboxes/${sandboxId}/checkpoints/${checkpointId}/restore`,
      ),
    onSuccess: (_response, input) => {
      qc.invalidateQueries({ queryKey: ["deployments", wid, "sandboxes", input.sandboxId] });
      qc.invalidateQueries({
        queryKey: ["deployments", wid, "sandboxes", input.sandboxId, "checkpoints"],
      });
    },
  });
}

export function useDeleteDeploySandboxCheckpoint(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sandboxId, checkpointId }: { sandboxId: string; checkpointId: string }) =>
      api.del<OkResponse>(
        `/workspaces/${wid}/deployments/sandboxes/${sandboxId}/checkpoints/${checkpointId}`,
      ),
    onSuccess: (_response, input) => {
      qc.invalidateQueries({
        queryKey: ["deployments", wid, "sandboxes", input.sandboxId, "checkpoints"],
      });
    },
  });
}

export const objectStorageBucketsQuery = (wid: string) => ({
  queryKey: ["object-storage", wid, "buckets"] as const,
  queryFn: () => api.get<ObjectStorageBucket[]>(`/workspaces/${wid}/object-storage/buckets`),
  refetchInterval: 15_000,
});

export function useObjectStorageBuckets(wid: string, enabled = true) {
  return useQuery({ ...objectStorageBucketsQuery(wid), enabled });
}

export const objectStorageBucketQuery = (wid: string, bucketId: string) => ({
  queryKey: ["object-storage", wid, "buckets", bucketId] as const,
  queryFn: () =>
    api.get<ObjectStorageBucket>(`/workspaces/${wid}/object-storage/buckets/${bucketId}`),
  refetchInterval: 10_000,
});

export function useObjectStorageBucket(wid: string, bucketId: string | null, enabled = true) {
  return useQuery({
    ...objectStorageBucketQuery(wid, bucketId ?? ""),
    enabled: enabled && !!bucketId,
  });
}

export function useCreateObjectStorageBucket(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug?: string;
      region?: string;
      access?: "private" | "public";
    }) =>
      api.post<CreatedObjectStorageBucket>(`/workspaces/${wid}/object-storage/buckets`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["object-storage", wid, "buckets"] }),
  });
}

export function useDeleteObjectStorageBucket(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bucketId: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/object-storage/buckets/${bucketId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["object-storage", wid, "buckets"] }),
  });
}

export const sandboxApiTokensQuery = (wid: string) => ({
  queryKey: ["deployments", wid, "sandboxes", "tokens"] as const,
  queryFn: () => api.get<SandboxApiToken[]>(`/workspaces/${wid}/deployments/sandboxes/tokens`),
});

export function useSandboxApiTokens(wid: string, enabled = true) {
  return useQuery({ ...sandboxApiTokensQuery(wid), enabled });
}

export function useCreateSandboxApiToken(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; expires_at?: string | null }) =>
      api.post<CreatedSandboxApiToken>(`/workspaces/${wid}/deployments/sandboxes/tokens`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments", wid, "sandboxes", "tokens"] }),
  });
}

export function useRevokeSandboxApiToken(wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      api.del<OkResponse>(`/workspaces/${wid}/deployments/sandboxes/tokens/${tokenId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments", wid, "sandboxes", "tokens"] }),
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
    mutationFn: (body: { email: string; password: string; accepted_legal_terms: boolean }) =>
      api.post<{ user: User; personal_workspace_id: string }>("/auth/register", body),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      api.post<{ ok: boolean }>("/auth/forgot-password", body),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api.post<AuthResponse>("/auth/reset-password", body),
    onSuccess: (r) => {
      auth.set(r.token);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
