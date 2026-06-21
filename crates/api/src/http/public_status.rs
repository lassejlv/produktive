use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Duration, FixedOffset, NaiveDate, Utc};
use entity::{custom_domain, monitor, workspace};
use sea_orm::{ColumnTrait, DatabaseBackend, EntityTrait, FromQueryResult, QueryFilter, Statement};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use url::Url;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    billing::{customer_state_for_billing, tier_of},
    error::{ApiError, ApiResult},
    state::AppState,
    status_summary_cache::SUMMARY_CACHE_CONTROL,
};

use super::custom_domains::{host_from_headers, normalize_domain};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status/{slug}", get(get_status))
        .route("/status/{slug}/summary", get(get_summary))
        .route("/status/by-domain/{domain}", get(get_status_by_domain))
        .route(
            "/status/by-domain/{domain}/summary",
            get(get_summary_by_domain),
        )
}

/// Page-relative summary routes (custom domain + slug-hosted status pages).
pub fn page_routes() -> Router<AppState> {
    Router::new()
        .route("/api/v2/summary.json", get(summary_by_host))
        .route("/summary", get(summary_by_host))
        .route("/s/{slug}/api/v2/summary.json", get(summary_by_slug_page))
        .route("/s/{slug}/summary", get(summary_by_slug_page))
}

/// Days of daily check history rendered as the uptime bar on the public page.
const HISTORY_DAYS: i64 = 90;

/// One day of aggregated check results for the uptime bar. The frontend colors
/// each day and computes uptime % from these counts.
#[derive(Clone, Serialize, ToSchema)]
pub struct DayBucket {
    /// UTC calendar day, `YYYY-MM-DD`.
    pub date: String,
    pub total: i64,
    pub up: i64,
    pub down: i64,
    pub degraded: i64,
    /// Mean response time (ms) over checks that recorded a latency that day.
    /// `None` when no successful checks were recorded.
    pub avg_latency_ms: Option<i32>,
}

#[derive(Clone, Serialize, ToSchema)]
pub struct PublicMonitor {
    pub id: Uuid,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub last_latency_ms: Option<i32>,
    pub last_checked_at: Option<DateTime<FixedOffset>>,
    /// Oldest-to-newest daily history, exactly `HISTORY_DAYS` entries (gaps zero-filled).
    pub history: Vec<DayBucket>,
}

#[derive(Serialize, ToSchema)]
pub struct PublicGroup {
    pub id: String,
    pub name: Option<String>,
    pub monitors: Vec<PublicMonitor>,
}

#[derive(Clone, Serialize, ToSchema)]
pub struct PublicIncident {
    pub id: Uuid,
    pub monitor_id: Option<Uuid>,
    pub monitor_name: Option<String>,
    pub monitor_slug: Option<String>,
    pub title: String,
    pub source: String,
    pub status: String,
    pub severity: String,
    pub started_at: DateTime<FixedOffset>,
    pub last_seen_at: DateTime<FixedOffset>,
    pub resolved_at: Option<DateTime<FixedOffset>>,
    pub updates: Vec<PublicIncidentUpdate>,
}

#[derive(Clone, Serialize, ToSchema)]
pub struct PublicIncidentUpdate {
    pub id: Uuid,
    pub incident_id: Uuid,
    pub status: String,
    pub message: String,
    pub created_at: DateTime<FixedOffset>,
}

#[derive(Serialize, ToSchema)]
pub struct StatusStyle {
    pub theme: String,
    pub accent: Option<String>,
    pub logo_url: Option<String>,
    pub header_link: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct PublicStatus {
    pub workspace_name: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub overall: String,
    pub monitors: Vec<PublicMonitor>,
    pub groups: Vec<PublicGroup>,
    pub incidents: Vec<PublicIncident>,
    pub style: StatusStyle,
    /// Whether to show the "Powered by …" footer on the public page.
    pub show_branding: bool,
    pub generated_at: DateTime<FixedOffset>,
}

/// Atlassian Statuspage-compatible summary payload (`/api/v2/summary.json`).
#[derive(Serialize, ToSchema)]
pub struct StatuspageSummary {
    pub page: StatuspagePage,
    pub status: StatuspageStatus,
    pub components: Vec<StatuspageComponent>,
    pub incidents: Vec<StatuspageIncident>,
    pub scheduled_maintenances: Vec<StatuspageScheduledMaintenance>,
}

#[derive(Serialize, ToSchema)]
pub struct StatuspagePage {
    pub id: String,
    pub name: String,
    pub url: String,
    pub time_zone: String,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Serialize, ToSchema)]
pub struct StatuspageStatus {
    pub indicator: String,
    pub description: String,
}

#[derive(Serialize, ToSchema)]
pub struct StatuspageComponent {
    pub id: String,
    pub name: String,
    pub status: String,
    pub position: i32,
    pub page_id: String,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
    pub description: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct StatuspageIncident {
    pub id: String,
    pub name: String,
    pub status: String,
    pub impact: String,
    pub page_id: String,
    pub shortlink: String,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
    pub monitoring_at: Option<DateTime<FixedOffset>>,
    pub resolved_at: Option<DateTime<FixedOffset>>,
    pub incident_updates: Vec<StatuspageIncidentUpdate>,
}

#[derive(Serialize, ToSchema)]
pub struct StatuspageScheduledMaintenance {
    pub id: String,
    pub name: String,
    pub status: String,
    pub impact: String,
    pub page_id: String,
    pub shortlink: String,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
    pub monitoring_at: Option<DateTime<FixedOffset>>,
    pub resolved_at: Option<DateTime<FixedOffset>>,
    pub scheduled_for: DateTime<FixedOffset>,
    pub scheduled_until: DateTime<FixedOffset>,
    pub incident_updates: Vec<StatuspageIncidentUpdate>,
}

#[derive(Serialize, ToSchema)]
pub struct StatuspageIncidentUpdate {
    pub id: String,
    pub incident_id: String,
    pub status: String,
    pub body: String,
    pub created_at: DateTime<FixedOffset>,
    pub display_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

struct LoadedPublicStatus {
    status: PublicStatus,
    monitor_created_at: HashMap<Uuid, DateTime<FixedOffset>>,
}

/// Shape of the JSONB `status_page_config` column.
#[derive(Deserialize, Default)]
struct StoredConfig {
    #[serde(default)]
    style: StoredStyle,
    #[serde(default)]
    groups: Vec<StoredGroup>,
    /// Monitors the owner has chosen to hide from the public page.
    #[serde(default)]
    hidden_monitor_ids: Vec<Uuid>,
}

#[derive(Deserialize, Default)]
struct StoredStyle {
    theme: Option<String>,
    accent: Option<String>,
    logo_url: Option<String>,
    header_link: Option<String>,
}

#[derive(Deserialize)]
struct StoredGroup {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    monitor_ids: Vec<Uuid>,
}

fn resolve_style(s: StoredStyle) -> StatusStyle {
    let theme = match s.theme.as_deref() {
        Some("light") => "light",
        Some("dark") => "dark",
        _ => "auto",
    }
    .to_string();
    let clean = |v: Option<String>| v.map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
    StatusStyle {
        theme,
        accent: clean(s.accent),
        logo_url: clean(s.logo_url).and_then(safe_public_url),
        header_link: clean(s.header_link).and_then(safe_public_url),
    }
}

fn safe_public_url(raw: String) -> Option<String> {
    let url = Url::parse(&raw).ok()?;
    match url.scheme() {
        "http" | "https" => Some(raw),
        _ => None,
    }
}

/// Worst-state-wins page status: any hard-down component makes the page
/// "down", otherwise any degraded component makes it "degraded" — a page must
/// never claim "all operational" above an amber row.
fn overall_status<'a>(statuses: impl Iterator<Item = &'a str>) -> &'static str {
    let mut overall = "unknown";
    for s in statuses {
        match s {
            "down" | "critical" => return "down",
            "degraded" | "maintenance" | "minor" => overall = "degraded",
            "up" if overall == "unknown" => overall = "up",
            _ => {}
        }
    }
    overall
}

#[derive(FromQueryResult)]
struct DayRow {
    monitor_id: Uuid,
    day: String,
    total: i64,
    up: i64,
    down: i64,
    degraded: i64,
    avg_latency_ms: Option<f64>,
}

/// Per-(monitor, day) aggregate carried from the SQL rollup into each `DayBucket`.
#[derive(Clone, Copy, Default)]
struct DayAgg {
    total: i64,
    up: i64,
    down: i64,
    degraded: i64,
    avg_latency_ms: Option<f64>,
}

#[derive(FromQueryResult)]
struct PublicIncidentRow {
    id: Uuid,
    monitor_id: Option<Uuid>,
    monitor_name: Option<String>,
    monitor_slug: Option<String>,
    title: String,
    source: String,
    status: String,
    severity: String,
    started_at: DateTime<FixedOffset>,
    last_seen_at: DateTime<FixedOffset>,
    resolved_at: Option<DateTime<FixedOffset>>,
}

#[derive(FromQueryResult)]
struct PublicIncidentUpdateRow {
    id: Uuid,
    incident_id: Uuid,
    status: String,
    message: String,
    created_at: DateTime<FixedOffset>,
}

#[utoipa::path(
    get,
    path = "/api/public/status/{slug}",
    params(("slug" = String, Path, description = "status page slug")),
    responses(
        (status = 200, body = PublicStatus),
        (status = 404, description = "Status page not found"),
    ),
    tag = "public"
)]
pub async fn get_status(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Json<PublicStatus>> {
    let ws = workspace_by_slug(&state, &slug).await?;
    let loaded = load_public_status(&state, ws).await?;
    Ok(Json(loaded.status))
}

#[utoipa::path(
    get,
    path = "/api/public/status/by-domain/{domain}",
    params(("domain" = String, Path, description = "custom status page domain")),
    responses(
        (status = 200, body = PublicStatus),
        (status = 404, description = "Status page not found"),
    ),
    tag = "public"
)]
pub async fn get_status_by_domain(
    State(state): State<AppState>,
    Path(domain): Path<String>,
) -> ApiResult<Response> {
    let ws = workspace_by_domain(&state, &domain).await?;
    let loaded = load_public_status(&state, ws).await?;
    let body = serde_json::to_vec(&loaded.status).map_err(|e| ApiError::Internal(e.into()))?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, SUMMARY_CACHE_CONTROL),
        ],
        body,
    )
        .into_response())
}

#[utoipa::path(
    get,
    path = "/api/public/status/{slug}/summary",
    params(("slug" = String, Path, description = "status page slug")),
    responses(
        (status = 200, body = StatuspageSummary),
        (status = 404, description = "Status page not found"),
    ),
    tag = "public"
)]
pub async fn get_summary(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Response> {
    let ws = workspace_by_slug(&state, &slug).await?;
    let page_url = page_url_for_slug(&state, ws.status_slug.as_deref().unwrap_or(&slug));
    summary_for_workspace(&state, ws, page_url).await
}

#[utoipa::path(
    get,
    path = "/api/public/status/by-domain/{domain}/summary",
    params(("domain" = String, Path, description = "custom status page domain")),
    responses(
        (status = 200, body = StatuspageSummary),
        (status = 404, description = "Status page not found"),
    ),
    tag = "public"
)]
pub async fn get_summary_by_domain(
    State(state): State<AppState>,
    Path(domain): Path<String>,
) -> ApiResult<Response> {
    let domain = normalize_domain(&domain)
        .ok_or_else(|| ApiError::bad_request("domain is not a valid hostname"))?;
    let ws = workspace_by_domain(&state, &domain).await?;
    let page_url = page_url_for_host(&format!("https://{domain}"));
    summary_for_workspace(&state, ws, page_url).await
}

pub async fn summary_by_slug_page(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Response> {
    let ws = workspace_by_slug(&state, &slug).await?;
    let page_url = page_url_for_slug(&state, ws.status_slug.as_deref().unwrap_or(&slug));
    summary_for_workspace(&state, ws, page_url).await
}

pub async fn summary_by_host(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let domain =
        host_from_headers(&headers).ok_or_else(|| ApiError::not_found("status page not found"))?;
    let ws = workspace_by_domain(&state, &domain).await?;
    let page_url = page_url_from_headers(&headers, &domain);
    summary_for_workspace(&state, ws, page_url).await
}

async fn workspace_by_slug(state: &AppState, slug: &str) -> ApiResult<workspace::Model> {
    let slug = slug.trim().to_lowercase();
    workspace::Entity::find()
        .filter(workspace::Column::StatusSlug.eq(&slug))
        .filter(workspace::Column::StatusPageEnabled.eq(true))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("status page not found"))
}

async fn workspace_by_domain(state: &AppState, domain: &str) -> ApiResult<workspace::Model> {
    let domain = normalize_domain(domain)
        .ok_or_else(|| ApiError::bad_request("domain is not a valid hostname"))?;
    let custom = custom_domain::Entity::find()
        .filter(custom_domain::Column::Hostname.eq(domain))
        .filter(custom_domain::Column::VerifiedAt.is_not_null())
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("status page not found"))?;
    workspace::Entity::find_by_id(custom.workspace_id)
        .filter(workspace::Column::StatusPageEnabled.eq(true))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("status page not found"))
}

async fn summary_for_workspace(
    state: &AppState,
    ws: workspace::Model,
    page_url: String,
) -> ApiResult<Response> {
    if let Some(body) = state.status_summary_cache.get(ws.id) {
        return Ok(summary_response(body));
    }

    let loaded = load_public_status(state, ws.clone()).await?;
    let summary = build_statuspage_summary(&ws, &loaded, &page_url);
    let body = serde_json::to_vec(&summary).map_err(|e| ApiError::Internal(e.into()))?;
    state.status_summary_cache.put(ws.id, body.clone());
    Ok(summary_response(body))
}

fn summary_response(body: Vec<u8>) -> Response {
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, SUMMARY_CACHE_CONTROL),
        ],
        body,
    )
        .into_response()
}

fn page_url_for_slug(state: &AppState, slug: &str) -> String {
    let slug = slug.trim().trim_matches('/');
    match state.config.app_url.as_deref() {
        Some(base) => format!("{}/s/{}", base.trim_end_matches('/'), slug),
        None => format!("/s/{slug}"),
    }
}

fn page_url_for_host(host_with_scheme: &str) -> String {
    host_with_scheme.trim_end_matches('/').to_string()
}

fn page_url_from_headers(headers: &HeaderMap, domain: &str) -> String {
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("https");
    format!("{scheme}://{domain}")
}

async fn load_public_status(
    state: &AppState,
    ws: workspace::Model,
) -> ApiResult<LoadedPublicStatus> {
    let config: StoredConfig = ws
        .status_page_config
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let hidden: std::collections::HashSet<Uuid> =
        config.hidden_monitor_ids.iter().copied().collect();

    let monitors: Vec<monitor::Model> = monitor::Entity::find()
        .filter(monitor::Column::WorkspaceId.eq(ws.id))
        .filter(monitor::Column::Enabled.eq(true))
        .all(&state.db)
        .await?
        .into_iter()
        .filter(|m| !hidden.contains(&m.id))
        .collect();

    // Daily check aggregates over the history window (UTC days), in one query
    // across all monitors. Gaps are zero-filled per monitor below.
    let today = Utc::now().date_naive();
    let from = (Utc::now() - Duration::days(HISTORY_DAYS)).fixed_offset();
    let day_rows: Vec<DayRow> = if monitors.is_empty() {
        Vec::new()
    } else {
        DayRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT monitor_id,
                   (date_trunc('day', time AT TIME ZONE 'UTC'))::date::text AS day,
                   COUNT(*)::bigint AS total,
                   COUNT(*) FILTER (WHERE status = 1)::bigint AS up,
                   COUNT(*) FILTER (WHERE status = 0)::bigint AS down,
                   COUNT(*) FILTER (WHERE status = 2)::bigint AS degraded,
                   AVG(latency_ms)::double precision AS avg_latency_ms
            FROM checks
            WHERE monitor_id = ANY($1) AND time >= $2
            GROUP BY monitor_id, day
            "#,
            [
                monitors.iter().map(|m| m.id).collect::<Vec<_>>().into(),
                from.into(),
            ],
        ))
        .all(&state.db)
        .await?
    };

    let mut counts: HashMap<(Uuid, String), DayAgg> = HashMap::new();
    for r in &day_rows {
        counts.insert(
            (r.monitor_id, r.day.clone()),
            DayAgg {
                total: r.total,
                up: r.up,
                down: r.down,
                degraded: r.degraded,
                avg_latency_ms: r.avg_latency_ms,
            },
        );
    }
    // Oldest-to-newest day axis, shared by every monitor.
    let days: Vec<NaiveDate> = (0..HISTORY_DAYS)
        .rev()
        .map(|i| today - Duration::days(i))
        .collect();

    let mut monitor_created_at = HashMap::new();
    let public_monitors: Vec<PublicMonitor> = monitors
        .into_iter()
        .map(|m| {
            monitor_created_at.insert(m.id, m.created_at);
            let history: Vec<DayBucket> = days
                .iter()
                .map(|d| {
                    let date = d.to_string();
                    let agg = counts
                        .get(&(m.id, date.clone()))
                        .copied()
                        .unwrap_or_default();
                    DayBucket {
                        date,
                        total: agg.total,
                        up: agg.up,
                        down: agg.down,
                        degraded: agg.degraded,
                        avg_latency_ms: agg.avg_latency_ms.map(|v| v.round() as i32),
                    }
                })
                .collect();
            let status = match m.last_status {
                Some(1) => "up",
                Some(2) => "degraded",
                Some(0) => "down",
                _ => "unknown",
            };
            PublicMonitor {
                id: m.id,
                name: m.name,
                kind: match m.kind {
                    entity::monitor::MonitorKind::Http => "http",
                    entity::monitor::MonitorKind::Tcp => "tcp",
                    entity::monitor::MonitorKind::Ping => "ping",
                    entity::monitor::MonitorKind::Postgres => "postgres",
                    entity::monitor::MonitorKind::Redis => "redis",
                    entity::monitor::MonitorKind::Ssh => "ssh",
                }
                .to_string(),
                status: status.to_string(),
                last_latency_ms: m.last_latency_ms,
                last_checked_at: m.last_checked_at,
                history,
            }
        })
        .collect();

    let style = resolve_style(config.style);
    // Hidden components shouldn't leak through their incidents either.
    let incidents: Vec<PublicIncident> = public_incidents(state, ws.id)
        .await?
        .into_iter()
        .filter(|i| {
            i.monitor_id
                .map_or(true, |monitor_id| !hidden.contains(&monitor_id))
        })
        .collect();
    let overall = overall_status(
        public_monitors.iter().map(|m| m.status.as_str()).chain(
            incidents
                .iter()
                .filter(|incident| incident.status == "open")
                .map(|incident| incident.severity.as_str()),
        ),
    );

    // Assemble groups: configured groups first (in stored order), then any
    // unassigned monitors fall into a trailing unnamed group.
    let mut by_id: HashMap<Uuid, PublicMonitor> =
        public_monitors.iter().map(|m| (m.id, m.clone())).collect();
    let order: Vec<Uuid> = public_monitors.iter().map(|m| m.id).collect();

    let mut groups: Vec<PublicGroup> = Vec::new();
    for g in &config.groups {
        let mut items = Vec::new();
        for mid in &g.monitor_ids {
            if let Some(mon) = by_id.remove(mid) {
                items.push(mon);
            }
        }
        if items.is_empty() {
            continue;
        }
        let name = g
            .name
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        groups.push(PublicGroup {
            id: g.id.clone().unwrap_or_else(|| Uuid::now_v7().to_string()),
            name,
            monitors: items,
        });
    }
    let leftover: Vec<PublicMonitor> = order
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect();
    if !leftover.is_empty() {
        groups.push(PublicGroup {
            id: "ungrouped".to_string(),
            name: None,
            monitors: leftover,
        });
    }

    let show_branding = resolve_show_branding(state, ws.id).await;

    Ok(LoadedPublicStatus {
        status: PublicStatus {
            workspace_name: ws.name,
            title: ws.status_page_title,
            description: ws.status_page_description,
            overall: overall.to_string(),
            monitors: public_monitors,
            groups,
            incidents,
            style,
            show_branding,
            generated_at: Utc::now().fixed_offset(),
        },
        monitor_created_at,
    })
}

async fn resolve_show_branding(state: &AppState, workspace_id: Uuid) -> bool {
    let Some(billing) = state.billing.as_ref() else {
        return true;
    };
    match customer_state_for_billing(state, workspace_id).await {
        Ok(cstate) => {
            let tier = tier_of(&billing.catalog, &cstate);
            !billing.catalog.tier_has_perk(tier, "remove_branding")
        }
        Err(error) => {
            tracing::warn!(
                %workspace_id,
                error = ?error,
                "branding check skipped; showing footer"
            );
            true
        }
    }
}

fn build_statuspage_summary(
    ws: &workspace::Model,
    loaded: &LoadedPublicStatus,
    page_url: &str,
) -> StatuspageSummary {
    let status = &loaded.status;
    let page_id = ws.id.to_string();
    let page_name = status
        .title
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(&status.workspace_name)
        .to_string();
    let (indicator, description) = statuspage_indicator(&status.overall);
    let shortlink_base = format!("{}/incidents", page_url.trim_end_matches('/'));

    let mut components = Vec::new();
    let mut position = 1i32;
    let mut placed = std::collections::HashSet::new();

    for group in &status.groups {
        for monitor in &group.monitors {
            if !placed.insert(monitor.id) {
                continue;
            }
            components.push(statuspage_component(
                monitor,
                &page_id,
                position,
                loaded.monitor_created_at.get(&monitor.id).copied(),
                status.generated_at,
            ));
            position += 1;
        }
    }

    let mut incidents = Vec::new();
    let mut scheduled_maintenances = Vec::new();

    for incident in &status.incidents {
        if incident.status != "open" {
            continue;
        }
        if incident.severity == "maintenance" {
            scheduled_maintenances.push(statuspage_scheduled_maintenance(
                incident,
                &page_id,
                &shortlink_base,
            ));
        } else {
            incidents.push(statuspage_incident(incident, &page_id, &shortlink_base));
        }
    }

    StatuspageSummary {
        page: StatuspagePage {
            id: page_id.clone(),
            name: page_name,
            url: page_url.to_string(),
            time_zone: "Etc/UTC".to_string(),
            updated_at: status.generated_at,
        },
        status: StatuspageStatus {
            indicator: indicator.to_string(),
            description: description.to_string(),
        },
        components,
        incidents,
        scheduled_maintenances,
    }
}

fn statuspage_component(
    monitor: &PublicMonitor,
    page_id: &str,
    position: i32,
    created_at: Option<DateTime<FixedOffset>>,
    generated_at: DateTime<FixedOffset>,
) -> StatuspageComponent {
    let created_at = created_at.unwrap_or(generated_at);
    let updated_at = monitor.last_checked_at.unwrap_or(generated_at);
    StatuspageComponent {
        id: monitor.id.to_string(),
        name: monitor.name.clone(),
        status: statuspage_component_status(&monitor.status).to_string(),
        position,
        page_id: page_id.to_string(),
        created_at,
        updated_at,
        description: None,
    }
}

fn statuspage_incident(
    incident: &PublicIncident,
    page_id: &str,
    shortlink_base: &str,
) -> StatuspageIncident {
    let latest_status = incident
        .updates
        .last()
        .map(|u| u.status.as_str())
        .unwrap_or("investigating");
    StatuspageIncident {
        id: incident.id.to_string(),
        name: incident.title.clone(),
        status: latest_status.to_string(),
        impact: statuspage_impact(&incident.severity).to_string(),
        page_id: page_id.to_string(),
        shortlink: shortlink_base.to_string(),
        created_at: incident.started_at,
        updated_at: incident.last_seen_at,
        monitoring_at: None,
        resolved_at: incident.resolved_at,
        incident_updates: incident
            .updates
            .iter()
            .map(|update| statuspage_incident_update(update))
            .collect(),
    }
}

fn statuspage_scheduled_maintenance(
    incident: &PublicIncident,
    page_id: &str,
    shortlink_base: &str,
) -> StatuspageScheduledMaintenance {
    let latest_status = incident
        .updates
        .last()
        .map(|u| u.status.as_str())
        .unwrap_or("scheduled");
    let maintenance_status = match latest_status {
        "in_progress" | "monitoring" | "identified" | "investigating" => "in_progress",
        _ => "scheduled",
    };
    let scheduled_until = incident.resolved_at.unwrap_or(incident.last_seen_at);
    StatuspageScheduledMaintenance {
        id: incident.id.to_string(),
        name: incident.title.clone(),
        status: maintenance_status.to_string(),
        impact: statuspage_impact(&incident.severity).to_string(),
        page_id: page_id.to_string(),
        shortlink: shortlink_base.to_string(),
        created_at: incident.started_at,
        updated_at: incident.last_seen_at,
        monitoring_at: None,
        resolved_at: incident.resolved_at,
        scheduled_for: incident.started_at,
        scheduled_until,
        incident_updates: incident
            .updates
            .iter()
            .map(|update| statuspage_incident_update(update))
            .collect(),
    }
}

fn statuspage_incident_update(update: &PublicIncidentUpdate) -> StatuspageIncidentUpdate {
    StatuspageIncidentUpdate {
        id: update.id.to_string(),
        incident_id: update.incident_id.to_string(),
        status: update.status.clone(),
        body: update.message.clone(),
        created_at: update.created_at,
        display_at: update.created_at,
        updated_at: update.created_at,
    }
}

fn statuspage_indicator(overall: &str) -> (&'static str, &'static str) {
    match overall {
        "up" => ("none", "All Systems Operational"),
        "down" => ("critical", "Major Service Outage"),
        "degraded" => ("minor", "Partial System Outage"),
        _ => ("minor", "Partial System Outage"),
    }
}

fn statuspage_component_status(status: &str) -> &'static str {
    match status {
        "up" => "operational",
        "degraded" => "degraded_performance",
        "down" => "major_outage",
        _ => "operational",
    }
}

fn statuspage_impact(severity: &str) -> &'static str {
    match severity {
        "critical" | "down" => "critical",
        "degraded" | "minor" => "minor",
        "informational" => "none",
        "maintenance" => "none",
        _ => "minor",
    }
}

async fn public_incidents(state: &AppState, workspace_id: Uuid) -> ApiResult<Vec<PublicIncident>> {
    let rows = PublicIncidentRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            i.id,
            i.monitor_id,
            m.name AS monitor_name,
            m.slug AS monitor_slug,
            i.title,
            CASE i.source
                WHEN 1 THEN 'manual'
                ELSE 'automatic'
            END AS source,
            CASE i.status
                WHEN 0 THEN 'open'
                WHEN 1 THEN 'resolved'
                ELSE 'unknown'
            END AS status,
            CASE i.severity
                WHEN 0 THEN 'down'
                WHEN 2 THEN 'degraded'
                WHEN 3 THEN 'maintenance'
                WHEN 4 THEN 'informational'
                WHEN 5 THEN 'minor'
                WHEN 6 THEN 'critical'
                ELSE 'unknown'
            END AS severity,
            i.started_at,
            i.last_seen_at,
            i.resolved_at
        FROM incidents i
        LEFT JOIN monitors m ON m.id = i.monitor_id
        WHERE i.workspace_id = $1
          AND (i.monitor_id IS NULL OR m.enabled = true)
          AND (
              i.status = $2
              OR (i.resolved_at IS NOT NULL AND i.resolved_at >= $3)
          )
        ORDER BY
            CASE i.status WHEN 0 THEN 0 ELSE 1 END,
            COALESCE(i.resolved_at, i.started_at) DESC
        LIMIT 20
        "#,
        [
            workspace_id.into(),
            0i16.into(),
            (Utc::now() - Duration::days(14)).fixed_offset().into(),
        ],
    ))
    .all(&state.db)
    .await?;

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<Uuid> = rows.iter().map(|row| row.id).collect();
    let updates = PublicIncidentUpdateRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            id,
            incident_id,
            CASE status
                WHEN 0 THEN 'investigating'
                WHEN 1 THEN 'identified'
                WHEN 2 THEN 'monitoring'
                WHEN 3 THEN 'resolved'
                ELSE 'unknown'
            END AS status,
            message,
            created_at
        FROM incident_updates
        WHERE workspace_id = $1
          AND incident_id = ANY($2)
        ORDER BY created_at ASC
        "#,
        [workspace_id.into(), ids.into()],
    ))
    .all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| PublicIncident {
            updates: updates
                .iter()
                .filter(|update| update.incident_id == row.id)
                .map(|update| PublicIncidentUpdate {
                    id: update.id,
                    incident_id: update.incident_id,
                    status: update.status.clone(),
                    message: update.message.clone(),
                    created_at: update.created_at,
                })
                .collect(),
            id: row.id,
            monitor_id: row.monitor_id,
            monitor_name: row.monitor_name,
            monitor_slug: row.monitor_slug,
            title: row.title,
            source: row.source,
            status: row.status,
            severity: row.severity,
            started_at: row.started_at,
            last_seen_at: row.last_seen_at,
            resolved_at: row.resolved_at,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{
        overall_status, safe_public_url, statuspage_component_status, statuspage_impact,
        statuspage_indicator,
    };

    #[test]
    fn filters_unsafe_public_style_urls() {
        assert_eq!(safe_public_url("javascript:alert(1)".to_string()), None);
        assert_eq!(safe_public_url("data:text/html,hi".to_string()), None);
        assert_eq!(
            safe_public_url("https://example.com".to_string()).as_deref(),
            Some("https://example.com")
        );
    }

    #[test]
    fn overall_is_worst_state_wins() {
        assert_eq!(overall_status([].into_iter()), "unknown");
        assert_eq!(overall_status(["up", "up"].into_iter()), "up");
        // A degraded component must never report as fully operational.
        assert_eq!(overall_status(["up", "degraded"].into_iter()), "degraded");
        assert_eq!(overall_status(["degraded", "up"].into_iter()), "degraded");
        assert_eq!(
            overall_status(["up", "degraded", "down"].into_iter()),
            "down"
        );
        assert_eq!(overall_status(["unknown", "up"].into_iter()), "up");
        assert_eq!(overall_status(["unknown"].into_iter()), "unknown");
    }

    #[test]
    fn statuspage_indicator_mapping() {
        assert_eq!(
            statuspage_indicator("up"),
            ("none", "All Systems Operational")
        );
        assert_eq!(
            statuspage_indicator("down"),
            ("critical", "Major Service Outage")
        );
        assert_eq!(
            statuspage_indicator("degraded"),
            ("minor", "Partial System Outage")
        );
        assert_eq!(
            statuspage_indicator("unknown"),
            ("minor", "Partial System Outage")
        );
    }

    #[test]
    fn statuspage_component_status_mapping() {
        assert_eq!(statuspage_component_status("up"), "operational");
        assert_eq!(
            statuspage_component_status("degraded"),
            "degraded_performance"
        );
        assert_eq!(statuspage_component_status("down"), "major_outage");
        assert_eq!(statuspage_component_status("unknown"), "operational");
    }

    #[test]
    fn statuspage_impact_mapping() {
        assert_eq!(statuspage_impact("critical"), "critical");
        assert_eq!(statuspage_impact("down"), "critical");
        assert_eq!(statuspage_impact("degraded"), "minor");
        assert_eq!(statuspage_impact("minor"), "minor");
        assert_eq!(statuspage_impact("informational"), "none");
        assert_eq!(statuspage_impact("maintenance"), "none");
    }
}
