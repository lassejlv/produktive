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

export type WorkspaceRole = "owner" | "admin" | "member";

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
  monitor_id: Uuid;
  monitor_name: string;
  monitor_slug: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  started_at: Iso;
  last_seen_at: Iso;
  resolved_at: Iso | null;
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
}

export interface User {
  id: Uuid;
  email: string;
  is_admin: boolean;
  created_at: Iso;
  personal_workspace_id: Uuid | null;
}

export interface AuthResponse {
  token: string;
  user: { id: Uuid; email: string; is_admin: boolean; created_at: Iso };
}

export interface OkResponse {
  ok: boolean;
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

export type IncidentStatus = "open" | "resolved" | "unknown";
export type IncidentSeverity = "down" | "degraded" | "unknown";

export interface Incident {
  id: Uuid;
  workspace_id: Uuid;
  monitor_id: Uuid;
  monitor_name: string;
  monitor_slug: string;
  monitor_kind: MonitorKind | "unknown";
  status: IncidentStatus;
  severity: IncidentSeverity;
  started_at: Iso;
  last_seen_at: Iso;
  resolved_at: Iso | null;
  error_message: string | null;
}

export interface Notification {
  id: Uuid;
  workspace_id: Uuid;
  monitor_id: Uuid | null;
  monitor_name: string | null;
  incident_id: Uuid | null;
  kind: "incident_opened" | "incident_resolved" | "unknown";
  title: string;
  body: string;
  created_at: Iso;
}

export interface NotificationChannel {
  id: Uuid;
  workspace_id: Uuid;
  name: string;
  kind: "webhook" | "unknown";
  masked_url: string;
  enabled: boolean;
  notify_resolved: boolean;
  created_at: Iso;
  updated_at: Iso;
}

export type MonitorStatus = "up" | "down" | "degraded" | "unknown";

export function monitorStatus(m: Monitor): MonitorStatus {
  if (!m.enabled || m.billing_paused_at) return "unknown";
  if (m.last_status === null) return "unknown";
  if (m.last_status === 1) return "up";
  if (m.last_status === 2) return "degraded";
  return "down";
}
