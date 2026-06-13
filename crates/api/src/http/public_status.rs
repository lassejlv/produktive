use axum::{
    extract::{Path, State},
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
    error::{ApiError, ApiResult},
    state::AppState,
};

use super::custom_domains::normalize_domain;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status/{slug}", get(get_status))
        .route("/status/by-domain/{domain}", get(get_status_by_domain))
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
    pub monitor_id: Uuid,
    pub monitor_name: String,
    pub monitor_slug: String,
    pub status: String,
    pub severity: String,
    pub started_at: DateTime<FixedOffset>,
    pub last_seen_at: DateTime<FixedOffset>,
    pub resolved_at: Option<DateTime<FixedOffset>>,
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
    pub generated_at: DateTime<FixedOffset>,
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
            "down" => return "down",
            "degraded" => overall = "degraded",
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
}

#[derive(FromQueryResult)]
struct PublicIncidentRow {
    id: Uuid,
    monitor_id: Uuid,
    monitor_name: String,
    monitor_slug: String,
    status: String,
    severity: String,
    started_at: DateTime<FixedOffset>,
    last_seen_at: DateTime<FixedOffset>,
    resolved_at: Option<DateTime<FixedOffset>>,
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
    let slug = slug.trim().to_lowercase();
    let ws = workspace::Entity::find()
        .filter(workspace::Column::StatusSlug.eq(&slug))
        .filter(workspace::Column::StatusPageEnabled.eq(true))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("status page not found"))?;

    status_for_workspace(&state, ws).await
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
) -> ApiResult<Json<PublicStatus>> {
    let domain = normalize_domain(&domain)
        .ok_or_else(|| ApiError::bad_request("domain is not a valid hostname"))?;
    let custom = custom_domain::Entity::find()
        .filter(custom_domain::Column::Hostname.eq(domain))
        .filter(custom_domain::Column::VerifiedAt.is_not_null())
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("status page not found"))?;
    let ws = workspace::Entity::find_by_id(custom.workspace_id)
        .filter(workspace::Column::StatusPageEnabled.eq(true))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("status page not found"))?;

    status_for_workspace(&state, ws).await
}

async fn status_for_workspace(
    state: &AppState,
    ws: workspace::Model,
) -> ApiResult<Json<PublicStatus>> {
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
                   COUNT(*) FILTER (WHERE status = 2)::bigint AS degraded
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

    let mut counts: HashMap<(Uuid, String), (i64, i64, i64, i64)> = HashMap::new();
    for r in &day_rows {
        counts.insert(
            (r.monitor_id, r.day.clone()),
            (r.total, r.up, r.down, r.degraded),
        );
    }
    // Oldest-to-newest day axis, shared by every monitor.
    let days: Vec<NaiveDate> = (0..HISTORY_DAYS)
        .rev()
        .map(|i| today - Duration::days(i))
        .collect();

    let public_monitors: Vec<PublicMonitor> = monitors
        .into_iter()
        .map(|m| {
            let history: Vec<DayBucket> = days
                .iter()
                .map(|d| {
                    let date = d.to_string();
                    let (total, up, down, degraded) = counts
                        .get(&(m.id, date.clone()))
                        .copied()
                        .unwrap_or((0, 0, 0, 0));
                    DayBucket {
                        date,
                        total,
                        up,
                        down,
                        degraded,
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

    let overall = overall_status(public_monitors.iter().map(|m| m.status.as_str()));

    let style = resolve_style(config.style);
    // Hidden components shouldn't leak through their incidents either.
    let incidents: Vec<PublicIncident> = public_incidents(state, ws.id)
        .await?
        .into_iter()
        .filter(|i| !hidden.contains(&i.monitor_id))
        .collect();

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

    Ok(Json(PublicStatus {
        workspace_name: ws.name,
        title: ws.status_page_title,
        description: ws.status_page_description,
        overall: overall.to_string(),
        monitors: public_monitors,
        groups,
        incidents,
        style,
        generated_at: Utc::now().fixed_offset(),
    }))
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
            CASE i.status
                WHEN 0 THEN 'open'
                WHEN 1 THEN 'resolved'
                ELSE 'unknown'
            END AS status,
            CASE i.severity
                WHEN 0 THEN 'down'
                WHEN 2 THEN 'degraded'
                ELSE 'unknown'
            END AS severity,
            i.started_at,
            i.last_seen_at,
            i.resolved_at
        FROM incidents i
        JOIN monitors m ON m.id = i.monitor_id
        WHERE i.workspace_id = $1
          AND m.enabled = true
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

    Ok(rows
        .into_iter()
        .map(|row| PublicIncident {
            id: row.id,
            monitor_id: row.monitor_id,
            monitor_name: row.monitor_name,
            monitor_slug: row.monitor_slug,
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
    use super::{overall_status, safe_public_url};

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
}
