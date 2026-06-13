use chrono::{DateTime, FixedOffset};
use entity::{monitor::MonitorKind, region};
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseBackend, EntityTrait, FromQueryResult, QueryFilter,
    Statement,
};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    billing::require_boolean_feature,
    error::{ApiError, ApiResult},
    state::AppState,
};

pub const DEFAULT_REGION_SLUG: &str = "eu-west";

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct RegionView {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub enabled: bool,
    pub heartbeat_at: Option<DateTime<FixedOffset>>,
    pub version: Option<String>,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct MonitorRegionView {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub enabled: bool,
    pub last_status: Option<i16>,
    pub last_latency_ms: Option<i32>,
    pub last_checked_at: Option<DateTime<FixedOffset>>,
    pub last_error: Option<String>,
}

#[derive(FromQueryResult)]
struct MonitorRegionRow {
    id: Uuid,
    slug: String,
    name: String,
    enabled: bool,
    last_status: Option<i16>,
    last_latency_ms: Option<i32>,
    last_checked_at: Option<DateTime<FixedOffset>>,
    last_error: Option<String>,
}

pub async fn list_enabled_regions(state: &AppState) -> ApiResult<Vec<RegionView>> {
    let regions = region::Entity::find()
        .filter(region::Column::Enabled.eq(true))
        .all(&state.db)
        .await?;
    Ok(regions.into_iter().map(region_view).collect())
}

pub async fn active_monitor_regions(
    state: &AppState,
    monitor_id: Uuid,
) -> ApiResult<Vec<region::Model>> {
    let rows = region::Model::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT r.id,
               r.slug,
               r.name,
               r.enabled,
               r.heartbeat_at,
               r.version,
               r.capabilities,
               r.created_at,
               r.updated_at
        FROM regions r
        JOIN monitor_regions mr ON mr.region_id = r.id
        WHERE mr.monitor_id = $1
          AND mr.enabled = true
          AND r.enabled = true
        ORDER BY r.slug
        "#,
        [monitor_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

pub async fn monitor_region_views(
    state: &AppState,
    monitor_id: Uuid,
) -> ApiResult<Vec<MonitorRegionView>> {
    let rows = MonitorRegionRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT r.id,
               r.slug,
               r.name,
               mr.enabled,
               s.last_status,
               s.last_latency_ms,
               s.last_checked_at,
               s.last_error
        FROM monitor_regions mr
        JOIN regions r ON r.id = mr.region_id
        LEFT JOIN monitor_region_states s
          ON s.monitor_id = mr.monitor_id AND s.region_id = mr.region_id
        WHERE mr.monitor_id = $1
          AND mr.enabled = true
          AND r.enabled = true
        ORDER BY r.slug
        "#,
        [monitor_id.into()],
    ))
    .all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| MonitorRegionView {
            id: row.id,
            slug: row.slug,
            name: row.name,
            enabled: row.enabled,
            last_status: row.last_status,
            last_latency_ms: row.last_latency_ms,
            last_checked_at: row.last_checked_at,
            last_error: row.last_error,
        })
        .collect())
}

pub async fn sync_monitor_regions(
    state: &AppState,
    workspace_id: Uuid,
    monitor_id: Uuid,
    kind: &MonitorKind,
    requested_slugs: Option<Vec<String>>,
) -> ApiResult<Vec<region::Model>> {
    let slugs = normalize_requested_slugs(requested_slugs);
    let regions = load_regions_by_slug(state, &slugs).await?;
    validate_region_selection(state, workspace_id, kind, &regions).await?;

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE monitor_regions
            SET enabled = false, updated_at = now()
            WHERE monitor_id = $1
            "#,
            [monitor_id.into()],
        ))
        .await?;

    let now = chrono::Utc::now().fixed_offset();
    for region in &regions {
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                INSERT INTO monitor_regions (monitor_id, region_id, enabled, created_at, updated_at)
                VALUES ($1, $2, true, $3, $3)
                ON CONFLICT (monitor_id, region_id) DO UPDATE
                SET enabled = true, updated_at = EXCLUDED.updated_at
                "#,
                [monitor_id.into(), region.id.into(), now.into()],
            ))
            .await?;

        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                INSERT INTO monitor_region_states (monitor_id, region_id, updated_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (monitor_id, region_id) DO NOTHING
                "#,
                [monitor_id.into(), region.id.into(), now.into()],
            ))
            .await?;
    }

    Ok(regions)
}

pub async fn validate_requested_regions(
    state: &AppState,
    workspace_id: Uuid,
    kind: &MonitorKind,
    requested_slugs: &[String],
) -> ApiResult<Vec<region::Model>> {
    let regions = load_regions_by_slug(state, requested_slugs).await?;
    validate_region_selection(state, workspace_id, kind, &regions).await?;
    Ok(regions)
}

pub async fn ensure_existing_regions_support(
    state: &AppState,
    workspace_id: Uuid,
    monitor_id: Uuid,
    kind: &MonitorKind,
) -> ApiResult<Vec<region::Model>> {
    let mut regions = active_monitor_regions(state, monitor_id).await?;
    if regions.is_empty() {
        regions = load_regions_by_slug(state, &[DEFAULT_REGION_SLUG.to_string()]).await?;
        sync_monitor_regions(
            state,
            workspace_id,
            monitor_id,
            kind,
            Some(vec![DEFAULT_REGION_SLUG.to_string()]),
        )
        .await?;
    }
    validate_region_selection(state, workspace_id, kind, &regions).await?;
    Ok(regions)
}

async fn validate_region_selection(
    state: &AppState,
    workspace_id: Uuid,
    kind: &MonitorKind,
    regions: &[region::Model],
) -> ApiResult<()> {
    if regions.is_empty() {
        return Err(ApiError::bad_request("at least one region is required"));
    }
    if regions.len() > 1 {
        require_boolean_feature(state, workspace_id, "multi_region").await?;
    }
    for region in regions {
        if !region_supports_kind(region, kind) {
            return Err(ApiError::bad_request(format!(
                "region `{}` does not support {} checks",
                region.slug,
                unstatus_probe::monitor_kind_name(kind)
            )));
        }
    }
    Ok(())
}

async fn load_regions_by_slug(state: &AppState, slugs: &[String]) -> ApiResult<Vec<region::Model>> {
    let regions = region::Entity::find()
        .filter(region::Column::Slug.is_in(slugs.to_vec()))
        .filter(region::Column::Enabled.eq(true))
        .all(&state.db)
        .await?;
    let found = regions
        .iter()
        .map(|region| region.slug.as_str())
        .collect::<std::collections::HashSet<_>>();
    if let Some(missing) = slugs.iter().find(|slug| !found.contains(slug.as_str())) {
        return Err(ApiError::bad_request(format!("unknown region `{missing}`")));
    }
    Ok(regions)
}

pub fn normalize_requested_slugs(requested_slugs: Option<Vec<String>>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut slugs = requested_slugs
        .unwrap_or_else(|| vec![DEFAULT_REGION_SLUG.to_string()])
        .into_iter()
        .map(|slug| slug.trim().to_lowercase())
        .filter(|slug| !slug.is_empty())
        .filter(|slug| seen.insert(slug.clone()))
        .collect::<Vec<_>>();
    if slugs.is_empty() {
        slugs.push(DEFAULT_REGION_SLUG.to_string());
    }
    slugs
}

fn region_supports_kind(region: &region::Model, kind: &MonitorKind) -> bool {
    let capability = unstatus_probe::monitor_kind_name(kind);
    capabilities(&region.capabilities)
        .iter()
        .any(|candidate| candidate == capability)
}

fn region_view(region: region::Model) -> RegionView {
    RegionView {
        id: region.id,
        slug: region.slug,
        name: region.name,
        enabled: region.enabled,
        heartbeat_at: region.heartbeat_at,
        version: region.version,
        capabilities: capabilities(&region.capabilities),
    }
}

pub fn capabilities(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|value| value.as_str())
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_empty_region_selection_to_default_region() {
        assert_eq!(
            normalize_requested_slugs(Some(vec![" ".into()])),
            vec!["eu-west".to_string()]
        );
    }

    #[test]
    fn normalizes_region_selection_case_and_duplicates() {
        assert_eq!(
            normalize_requested_slugs(Some(vec!["FRA".into(), "fra".into(), "IAD".into()])),
            vec!["fra".to_string(), "iad".to_string()]
        );
    }
}
