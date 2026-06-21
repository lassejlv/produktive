export type Uuid = string;
export type Iso = string;

export type MonitorKind = "http" | "tcp" | "ping" | "postgres" | "redis" | "ssh";

export interface Region {
  id: Uuid;
  slug: string;
  name: string;
  enabled: boolean;
  heartbeat_at: Iso | null;
  version: string | null;
  capabilities: MonitorKind[];
}

export interface AdminRegion extends Region {
  created_at: Iso;
  updated_at: Iso;
}

export interface AdminLogBucket {
  id: Uuid;
  name: string;
  storage_uri: string;
  region: string | null;
  endpoint: string | null;
  access_key_id: string | null;
  secret_configured: boolean;
  enabled: boolean;
  max_projects: number;
  project_count: number;
  created_at: Iso;
  updated_at: Iso;
}

export interface MonitorRegion {
  id: Uuid;
  slug: string;
  name: string;
  enabled: boolean;
  last_status: number | null;
  last_latency_ms: number | null;
  last_checked_at: Iso | null;
  last_error: string | null;
}

export interface Monitor {
  id: Uuid;
  workspace_id: Uuid;
  slug: string;
  name: string;
  kind: MonitorKind;
  target: string;
  interval_seconds: number;
  timeout_ms: number;
  expected_status: number | null;
  expected_body_contains: string | null;
  enabled: boolean;
  billing_paused_at: Iso | null;
  last_status: number | null;
  last_latency_ms: number | null;
  last_checked_at: Iso | null;
  canvas_x: number;
  canvas_y: number;
  dsl_source: string | null;
  regions: MonitorRegion[];
  created_at: Iso;
  updated_at: Iso;
}

export type WorkspaceRole = "owner" | "member";

export type StatusTheme = "auto" | "light" | "dark";

export interface StatusStyle {
  theme: StatusTheme;
  accent: string | null;
  logo_url: string | null;
  header_link: string | null;
}

export interface StatusGroup {
  id: string;
  name: string | null;
  monitor_ids: Uuid[];
}

export interface StatusPageConfig {
  style: StatusStyle;
  groups: StatusGroup[];
  /** Monitors hidden from the public page (still counted in the workspace, just not shown). */
  hidden_monitor_ids?: Uuid[];
}

export interface Workspace {
  id: Uuid;
  slug: string;
  name: string;
  is_personal: boolean;
  owner_id: Uuid;
  role: WorkspaceRole;
  status_slug: string | null;
  status_page_enabled: boolean;
  status_page_title: string | null;
  status_page_description: string | null;
  status_page_config: StatusPageConfig | null;
  created_at: Iso;
  updated_at: Iso;
  requires_upgrade?: boolean | null;
  checkout_url?: string | null;
}

export type WorkspacePatch = Partial<
  Pick<
    Workspace,
    | "name"
    | "slug"
    | "status_slug"
    | "status_page_enabled"
    | "status_page_title"
    | "status_page_description"
    | "status_page_config"
  >
>;

export type CreateMonitorBody =
  | {
      name: string;
      kind: MonitorKind;
      target: string;
      interval_seconds: number;
      enabled: boolean;
      region_slugs: string[];
    }
  | {
      name: string;
      dsl_source: string;
      enabled: boolean;
      region_slugs: string[];
    };

/** Partial update for a monitor. Mirrors the backend `UpdateMonitor` struct — every
 * field is optional, and `null` on a nullable field clears it (e.g. `dsl_source: null`
 * reverts to form-based config). */
export interface UpdateMonitorBody {
  name?: string;
  kind?: MonitorKind;
  target?: string;
  interval_seconds?: number;
  timeout_ms?: number;
  expected_status?: number | null;
  expected_body_contains?: string | null;
  enabled?: boolean;
  canvas_x?: number;
  canvas_y?: number;
  dsl_source?: string | null;
  region_slugs?: string[];
}

export interface CustomDomain {
  id: Uuid;
  workspace_id: Uuid;
  hostname: string;
  verification_name: string;
  verification_value: string;
  verified_at: Iso | null;
  cname_target: string;
  proxy_ipv4: string | null;
  proxy_ipv6: string | null;
  created_at: Iso;
  updated_at: Iso;
}

export const DEFAULT_STATUS_STYLE: StatusStyle = {
  theme: "auto",
  accent: null,
  logo_url: null,
  header_link: null,
};

/** One day of aggregated check results, used to draw the uptime history bar. */
export interface DayBucket {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  total: number;
  up: number;
  down: number;
  degraded: number;
  /** Mean response time (ms) over checks that recorded a latency that day; null when none. */
  avg_latency_ms: number | null;
}

export interface PublicMonitor {
  id: Uuid;
  name: string;
  kind: MonitorKind;
  status: "up" | "down" | "degraded" | "unknown";
  last_latency_ms: number | null;
  last_checked_at: Iso | null;
  /** Oldest-to-newest daily history (gaps zero-filled). */
  history: DayBucket[];
}

export interface PublicGroup {
  id: string;
  name: string | null;
  monitors: PublicMonitor[];
}

export interface PublicIncident {
  id: Uuid;
  monitor_id: Uuid | null;
  monitor_name: string | null;
  monitor_slug: string | null;
  title: string;
  source: "automatic" | "manual";
  status: IncidentStatus;
  severity: IncidentSeverity;
  started_at: Iso;
  last_seen_at: Iso;
  resolved_at: Iso | null;
  updates: PublicIncidentUpdate[];
}

export interface PublicIncidentUpdate {
  id: Uuid;
  incident_id: Uuid;
  status: IncidentUpdateStatus;
  message: string;
  created_at: Iso;
}

export type PublicOverall = "up" | "degraded" | "down" | "unknown";

export interface PublicStatus {
  workspace_name: string;
  title: string | null;
  description: string | null;
  overall: PublicOverall;
  monitors: PublicMonitor[];
  groups: PublicGroup[];
  incidents: PublicIncident[];
  style: StatusStyle;
  generated_at: Iso;
  show_branding: boolean;
}

export interface User {
  id: Uuid;
  email: string;
  is_admin: boolean;
  legal_terms_accepted_at: Iso | null;
  created_at: Iso;
  personal_workspace_id: Uuid | null;
}

export interface AuthResponse {
  token: string;
  user: {
    id: Uuid;
    email: string;
    is_admin: boolean;
    legal_terms_accepted_at: Iso | null;
    created_at: Iso;
  };
}

export interface OkResponse {
  ok: boolean;
}

export type LogAccessStatus = "none" | "pending" | "approved" | "denied";

export interface LogAccess {
  status: LogAccessStatus;
  requested_at: Iso | null;
  decided_at: Iso | null;
}

export type DeployAccessStatus = "none" | "pending" | "approved" | "denied" | "disabled";
export type DeployStatus =
  | "queued"
  | "provisioning"
  | "pulling"
  | "starting"
  | "healthy"
  | "live"
  | "failed"
  | "rolling_back"
  | "rolled_back"
  | "stopped"
  | "unknown";
export type DeployRegistryKind = "ghcr" | "docker_hub";
export type DeployResourcePreset = "preview_small" | "preview_medium" | "preview_large";

export interface DeployAccess {
  status: DeployAccessStatus;
  requested_at: Iso | null;
  decided_at: Iso | null;
}

export interface AdminDeployAccessRequest {
  id: Uuid;
  workspace_id: Uuid;
  workspace_name: string;
  workspace_slug: string;
  status: "pending" | "approved" | "denied" | "unknown";
  requested_by_email: string | null;
  requested_at: Iso;
  decided_by_email: string | null;
  decided_at: Iso | null;
}

export interface DeployRegistryCredential {
  id: Uuid;
  workspace_id: Uuid;
  name: string;
  registry_kind: DeployRegistryKind | string;
  username: string;
  revoked_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface DeployService {
  id: Uuid;
  workspace_id: Uuid;
  registry_credential_id: Uuid | null;
  provider: "fly" | string;
  provider_service_id: string | null;
  provider_metadata: unknown;
  slug: string;
  name: string;
  image: string;
  registry_kind: DeployRegistryKind | string;
  internal_port: number;
  env: Record<string, string>;
  environment: string;
  health_check_path: string;
  region: string;
  resource_preset: DeployResourcePreset | string;
  url: string | null;
  status: DeployStatus;
  disabled_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface Deployment {
  id: Uuid;
  workspace_id: Uuid;
  service_id: Uuid;
  image: string;
  image_digest: string | null;
  status: DeployStatus;
  provider: "fly" | string;
  provider_deployment_id: string | null;
  provider_instance_id: string | null;
  provider_metadata: unknown;
  failure_message: string | null;
  url: string | null;
  started_at: Iso | null;
  finished_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface DeployServiceDomain {
  id: Uuid;
  workspace_id: Uuid;
  service_id: Uuid;
  provider: "fly" | string;
  provider_domain_id: string | null;
  hostname: string;
  status: string;
  dns_requirements: unknown;
  validation_errors: unknown;
  provider_metadata: unknown;
  verified_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface DeployServiceVolume {
  id: Uuid;
  workspace_id: Uuid;
  service_id: Uuid;
  provider: "fly" | string;
  provider_volume_id: string | null;
  name: string;
  mount_path: string;
  region: string;
  size_gb: number;
  status: string;
  provider_metadata: unknown;
  created_at: Iso;
  updated_at: Iso;
}

export interface DeployEvent {
  id: Uuid;
  service_id: Uuid;
  deployment_id: Uuid | null;
  level: "info" | "warn" | "error" | string;
  message: string;
  data: unknown;
  created_at: Iso;
}

export interface DeployLogLine {
  timestamp: Iso;
  level: string;
  message: string;
  data: unknown;
}

export interface DeployMetricPoint {
  bucket_start: Iso;
  cpu_percent: number | null;
  memory_mb: number | null;
  requests: number | null;
}

export interface AdminWorkspaceUsage {
  workspace_id: Uuid;
  workspace_name: string;
  workspace_slug: string;
  billing_workspace_id: Uuid;
  is_billing_customer: boolean;
  billing_enabled: boolean;
  plan: string;
  events_used: number;
  events_included: number | null;
  events_overage_allowed: boolean;
  monitors_used: number;
  monitors_included: number | null;
  members_used: number;
  members_included: number | null;
  current_period_end: Iso | null;
  usage_reset_at: Iso | null;
}

export interface AdminUsageResetResult {
  workspace_id: Uuid;
  billing_workspace_id: Uuid;
  events_consumed_before: number;
  events_consumed_after: number;
  polar_event_ingested: boolean;
}

export interface AdminLogAccessRequest {
  id: Uuid;
  workspace_id: Uuid;
  workspace_name: string;
  workspace_slug: string;
  status: "pending" | "approved" | "denied" | "unknown";
  requested_by_email: string | null;
  requested_at: Iso;
  decided_by_email: string | null;
  decided_at: Iso | null;
}

export interface Check {
  time: Iso;
  region_id: Uuid | null;
  region_slug: string | null;
  region_name: string | null;
  status: number;
  latency_ms: number | null;
  status_code: number | null;
  error_message: string | null;
}

export interface Stats {
  window_seconds: number;
  total: number;
  up: number;
  down: number;
  uptime_percent: number;
  avg_latency_ms: number | null;
}

/** One time-bucket of the response-time chart over the selected window. */
export interface LatencyPoint {
  /** Bucket start, ISO timestamp. */
  time: Iso;
  /** Mean response time (ms) over checks in the bucket that recorded a latency; null when none. */
  avg_latency_ms: number | null;
  up: number;
  down: number;
  total: number;
}

export type IncidentStatus = "open" | "resolved" | "unknown";
export type IncidentSeverity =
  | "informational"
  | "maintenance"
  | "minor"
  | "degraded"
  | "down"
  | "critical"
  | "unknown";
export type IncidentSource = "automatic" | "manual";
export type IncidentUpdateStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "unknown";

export interface Incident {
  id: Uuid;
  workspace_id: Uuid;
  monitor_id: Uuid | null;
  monitor_name: string | null;
  monitor_slug: string | null;
  monitor_kind: MonitorKind | "unknown" | null;
  title: string;
  source: IncidentSource;
  status: IncidentStatus;
  severity: IncidentSeverity;
  started_at: Iso;
  last_seen_at: Iso;
  resolved_at: Iso | null;
  error_message: string | null;
  updates: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: Uuid;
  incident_id: Uuid;
  status: IncidentUpdateStatus;
  message: string;
  created_by: Uuid | null;
  created_at: Iso;
}

export interface Notification {
  id: Uuid;
  workspace_id: Uuid;
  monitor_id: Uuid | null;
  monitor_name: string | null;
  incident_id: Uuid | null;
  kind: "incident_opened" | "incident_resolved" | "log_alert_fired" | "unknown";
  title: string;
  body: string;
  created_at: Iso;
}

export interface NotificationChannel {
  id: Uuid;
  workspace_id: Uuid;
  name: string;
  kind: "webhook" | "slack" | "discord" | "unknown";
  masked_url: string;
  enabled: boolean;
  notify_resolved: boolean;
  last_delivery_status: "ok" | "failed" | "unknown" | null;
  last_delivery_at: Iso | null;
  last_delivery_error: string | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface NotificationDelivery {
  id: Uuid;
  notification_id: Uuid;
  channel_id: Uuid;
  status: "ok" | "failed" | "unknown";
  error_message: string | null;
  sent_at: Iso | null;
  created_at: Iso;
  notification_title: string | null;
}

export interface LogProject {
  id: Uuid;
  workspace_id: Uuid;
  bucket_id: Uuid | null;
  bucket_name: string | null;
  bucket_storage_uri: string | null;
  slug: string;
  name: string;
  description: string | null;
  retention_days: number;
  created_at: Iso;
  updated_at: Iso;
  event_count_24h: number;
  bytes_ingested_24h: number;
  last_ingested_at: Iso | null;
}

export interface LogIngestToken {
  id: Uuid;
  workspace_id: Uuid;
  project_id: Uuid;
  name: string;
  token_prefix: string;
  last_used_at: Iso | null;
  expires_at: Iso | null;
  revoked_at: Iso | null;
  created_at: Iso;
}

export interface CreatedLogIngestToken {
  token: string;
  token_view: LogIngestToken;
}

export interface LogAlertRule {
  id: Uuid;
  workspace_id: Uuid;
  project_id: Uuid;
  name: string;
  query: string;
  level: string | null;
  threshold_count: number;
  window_seconds: number;
  enabled: boolean;
  last_evaluated_at: Iso | null;
  last_fired_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface LogSearchEvent {
  event_id: string;
  timestamp: Iso;
  received_at: Iso;
  level: string;
  message: string;
  service: string | null;
  environment: string | null;
  operation: string | null;
  request_id: string | null;
  trace_id: string | null;
  source: string;
  event: unknown;
  fields: unknown;
}

export interface LogStorageInfo {
  storage_uri: string;
  backend: "local" | "s3" | string;
}

export interface LogSearchResponse {
  events: LogSearchEvent[];
  storage: LogStorageInfo;
}

export interface WorkspaceMember {
  user_id: Uuid;
  email: string;
  role: WorkspaceRole;
  created_at: Iso;
}

export interface WorkspaceInvite {
  id: Uuid;
  email: string;
  role: WorkspaceRole;
  expires_at: Iso;
  accepted_at: Iso | null;
  created_at: Iso;
}

export interface InviteCreated {
  id: Uuid;
  email: string;
  role: WorkspaceRole;
  expires_at: Iso;
  token: string;
  accept_url: string;
  email_sent: boolean;
}

export interface InvitePreview {
  workspace_id: Uuid;
  workspace_name: string;
  email: string;
  role: WorkspaceRole;
  expires_at: Iso;
}

export type MonitorStatus = "up" | "down" | "degraded" | "unknown";

export function monitorStatus(m: Monitor): MonitorStatus {
  if (!m.enabled || m.billing_paused_at) return "unknown";
  if (m.last_status === null) return "unknown";
  if (m.last_status === 1) return "up";
  if (m.last_status === 2) return "degraded";
  return "down";
}
