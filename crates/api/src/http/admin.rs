use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{DateTime, FixedOffset};
use entity::{region, workspace};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseBackend, EntityTrait,
    FromQueryResult, QueryFilter, QueryOrder, Statement, Value,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    billing,
    error::{ApiError, ApiResult},
    regions,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/regions", get(list_regions))
        .route(
            "/regions/{region_id}",
            patch(update_region).delete(delete_region),
        )
        .route(
            "/log-buckets",
            get(list_log_buckets).post(create_log_bucket),
        )
        .route(
            "/log-buckets/{bucket_id}",
            patch(update_log_bucket).delete(delete_log_bucket),
        )
        .route("/log-access-requests", get(list_log_access_requests))
        .route(
            "/log-access-requests/{request_id}",
            patch(decide_log_access_request),
        )
        .route("/workspaces/{workspace}/usage", get(get_workspace_usage))
        .route(
            "/workspaces/{workspace}/usage/reset",
            post(reset_workspace_usage),
        )
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct AdminRegionView {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub enabled: bool,
    pub heartbeat_at: Option<DateTime<FixedOffset>>,
    pub version: Option<String>,
    pub capabilities: Vec<String>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRegionBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, FromQueryResult, ToSchema)]
pub struct AdminLogBucketView {
    pub id: Uuid,
    pub name: String,
    pub storage_uri: String,
    pub region: Option<String>,
    pub endpoint: Option<String>,
    pub access_key_id: Option<String>,
    pub secret_configured: bool,
    pub enabled: bool,
    pub max_projects: i32,
    pub project_count: i64,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateLogBucketBody {
    pub name: String,
    pub storage_uri: String,
    pub region: Option<String>,
    pub endpoint: Option<String>,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
    pub enabled: Option<bool>,
    pub max_projects: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateLogBucketBody {
    pub name: Option<String>,
    pub storage_uri: Option<String>,
    #[schema(value_type = Option<String>)]
    pub region: Option<Option<String>>,
    #[schema(value_type = Option<String>)]
    pub endpoint: Option<Option<String>>,
    #[schema(value_type = Option<String>)]
    pub access_key_id: Option<Option<String>>,
    #[schema(value_type = Option<String>)]
    pub secret_access_key: Option<Option<String>>,
    pub enabled: Option<bool>,
    pub max_projects: Option<i32>,
}

async fn list_regions(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<AdminRegionView>>> {
    require_admin(&auth)?;
    let rows = region::Entity::find()
        .order_by_asc(region::Column::Slug)
        .all(&state.db)
        .await?;
    Ok(Json(rows.into_iter().map(admin_region_view).collect()))
}

async fn update_region(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(region_id): Path<Uuid>,
    Json(body): Json<UpdateRegionBody>,
) -> ApiResult<Json<AdminRegionView>> {
    require_admin(&auth)?;
    let row = region::Entity::find_by_id(region_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("region not found"))?;
    let mut model: region::ActiveModel = row.into();

    if let Some(name) = body.name {
        let name = name.trim();
        if name.is_empty() || name.len() > 80 {
            return Err(ApiError::bad_request(
                "region name must be between 1 and 80 characters",
            ));
        }
        model.name = Set(name.to_string());
    }
    if let Some(enabled) = body.enabled {
        model.enabled = Set(enabled);
    }
    model.updated_at = Set(chrono::Utc::now().fixed_offset());

    let updated = model.update(&state.db).await?;
    Ok(Json(admin_region_view(updated)))
}

async fn delete_region(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(region_id): Path<Uuid>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    require_admin(&auth)?;
    let row = region::Entity::find_by_id(region_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("region not found"))?;
    // The control plane's in-process worker probes from this region and every
    // monitor is assigned to it by default; deleting it would orphan those
    // assignments, so it can only ever be disabled.
    if row.slug == state.config.local_region_slug {
        return Err(ApiError::bad_request(
            "the control plane's local region cannot be deleted",
        ));
    }
    // monitor_regions / monitor_region_states cascade on delete; historical
    // `checks` rows keep their region_id (no FK) as immutable telemetry.
    region::Entity::delete_by_id(row.id).exec(&state.db).await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

async fn list_log_buckets(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<AdminLogBucketView>>> {
    require_admin(&auth)?;
    Ok(Json(load_log_buckets(&state).await?))
}

async fn create_log_bucket(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateLogBucketBody>,
) -> ApiResult<Json<AdminLogBucketView>> {
    require_admin(&auth)?;
    let name = clean_required(&body.name, "bucket name")?;
    let storage_uri = clean_storage_uri(&body.storage_uri)?;
    let max_projects = body.max_projects.unwrap_or(100).clamp(1, 10_000);
    let now = chrono::Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_storage_buckets (
                id, name, storage_uri, region, endpoint, access_key_id, secret_access_key,
                enabled, max_projects, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
            "#,
            vec![
                id.into(),
                name.into(),
                storage_uri.into(),
                clean_optional(body.region).into(),
                clean_optional(body.endpoint).into(),
                clean_optional(body.access_key_id).into(),
                clean_optional(body.secret_access_key).into(),
                body.enabled.unwrap_or(true).into(),
                max_projects.into(),
                now.into(),
            ],
        ))
        .await?;
    load_log_bucket(&state, id).await.map(Json)
}

async fn update_log_bucket(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(bucket_id): Path<Uuid>,
    Json(body): Json<UpdateLogBucketBody>,
) -> ApiResult<Json<AdminLogBucketView>> {
    require_admin(&auth)?;
    let mut assignments = Vec::new();
    let mut values: Vec<Value> = vec![bucket_id.into()];
    let mut next = 2;
    if let Some(name) = body.name {
        assignments.push(format!("name = ${next}"));
        values.push(clean_required(&name, "bucket name")?.into());
        next += 1;
    }
    if let Some(storage_uri) = body.storage_uri {
        assignments.push(format!("storage_uri = ${next}"));
        values.push(clean_storage_uri(&storage_uri)?.into());
        next += 1;
    }
    if let Some(region) = body.region {
        assignments.push(format!("region = ${next}"));
        values.push(clean_optional(region).into());
        next += 1;
    }
    if let Some(endpoint) = body.endpoint {
        assignments.push(format!("endpoint = ${next}"));
        values.push(clean_optional(endpoint).into());
        next += 1;
    }
    if let Some(access_key_id) = body.access_key_id {
        assignments.push(format!("access_key_id = ${next}"));
        values.push(clean_optional(access_key_id).into());
        next += 1;
    }
    if let Some(secret_access_key) = body.secret_access_key {
        assignments.push(format!("secret_access_key = ${next}"));
        values.push(clean_optional(secret_access_key).into());
        next += 1;
    }
    if let Some(enabled) = body.enabled {
        assignments.push(format!("enabled = ${next}"));
        values.push(enabled.into());
        next += 1;
    }
    if let Some(max_projects) = body.max_projects {
        assignments.push(format!("max_projects = ${next}"));
        values.push(max_projects.clamp(1, 10_000).into());
    }
    if assignments.is_empty() {
        return load_log_bucket(&state, bucket_id).await.map(Json);
    }
    assignments.push("updated_at = now()".to_string());
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "UPDATE log_storage_buckets SET {} WHERE id = $1",
                assignments.join(", ")
            ),
            values,
        ))
        .await?;
    load_log_bucket(&state, bucket_id).await.map(Json)
}

async fn delete_log_bucket(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(bucket_id): Path<Uuid>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    require_admin(&auth)?;
    let project_count = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT COUNT(*)::bigint AS count FROM log_projects WHERE bucket_id = $1",
            vec![bucket_id.into()],
        ))
        .await?
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0);
    if project_count > 0 {
        return Err(ApiError::bad_request(
            "bucket has assigned log projects and cannot be deleted",
        ));
    }
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM log_storage_buckets WHERE id = $1",
            vec![bucket_id.into()],
        ))
        .await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

#[derive(Debug, Serialize, FromQueryResult, ToSchema)]
pub struct AdminLogAccessRequestView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub workspace_slug: String,
    /// One of `pending`, `approved`, `denied`.
    pub status: String,
    pub requested_by_email: Option<String>,
    pub requested_at: DateTime<FixedOffset>,
    pub decided_by_email: Option<String>,
    pub decided_at: Option<DateTime<FixedOffset>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct DecideLogAccessBody {
    /// `approved` or `denied`.
    pub status: String,
}

const LOG_ACCESS_REQUEST_SELECT: &str = r#"
    SELECT r.id,
           r.workspace_id,
           w.name AS workspace_name,
           w.slug AS workspace_slug,
           CASE r.status
               WHEN 0 THEN 'pending'
               WHEN 1 THEN 'approved'
               WHEN 2 THEN 'denied'
               ELSE 'unknown'
           END AS status,
           ru.email AS requested_by_email,
           r.requested_at,
           du.email AS decided_by_email,
           r.decided_at
    FROM log_access_requests r
    JOIN workspaces w ON w.id = r.workspace_id
    LEFT JOIN users ru ON ru.id = r.requested_by
    LEFT JOIN users du ON du.id = r.decided_by
"#;

async fn list_log_access_requests(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<AdminLogAccessRequestView>>> {
    require_admin(&auth)?;
    let rows = AdminLogAccessRequestView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        format!(
            "{LOG_ACCESS_REQUEST_SELECT} ORDER BY (r.status = 0) DESC, r.requested_at DESC"
        ),
        Vec::<Value>::new(),
    ))
    .all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn decide_log_access_request(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(request_id): Path<Uuid>,
    Json(body): Json<DecideLogAccessBody>,
) -> ApiResult<Json<AdminLogAccessRequestView>> {
    require_admin(&auth)?;
    let status: i16 = match body.status.as_str() {
        "approved" => 1,
        "denied" => 2,
        _ => {
            return Err(ApiError::bad_request(
                "status must be 'approved' or 'denied'",
            ))
        }
    };
    let updated = state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE log_access_requests
            SET status = $2, decided_by = $3, decided_at = now(), updated_at = now()
            WHERE id = $1
            "#,
            vec![request_id.into(), status.into(), auth.user.id.into()],
        ))
        .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::not_found("log access request"));
    }
    load_log_access_request(&state, request_id).await.map(Json)
}

async fn load_log_access_request(
    state: &AppState,
    request_id: Uuid,
) -> ApiResult<AdminLogAccessRequestView> {
    AdminLogAccessRequestView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        format!("{LOG_ACCESS_REQUEST_SELECT} WHERE r.id = $1"),
        vec![request_id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("log access request"))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminWorkspaceUsageView {
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub workspace_slug: String,
    /// The owner's personal workspace — the actual Polar billing customer.
    pub billing_workspace_id: Uuid,
    pub is_billing_customer: bool,
    pub billing_enabled: bool,
    pub plan: String,
    pub events_used: f64,
    pub events_included: Option<f64>,
    pub events_overage_allowed: bool,
    pub monitors_used: f64,
    pub monitors_included: Option<f64>,
    pub members_used: f64,
    pub members_included: Option<f64>,
    pub current_period_end: Option<DateTime<FixedOffset>>,
    pub usage_reset_at: Option<DateTime<FixedOffset>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminUsageResetResult {
    pub workspace_id: Uuid,
    pub billing_workspace_id: Uuid,
    pub events_consumed_before: f64,
    pub events_consumed_after: f64,
    pub polar_event_ingested: bool,
}

async fn resolve_workspace(state: &AppState, ident: &str) -> ApiResult<workspace::Model> {
    if let Ok(id) = Uuid::parse_str(ident) {
        if let Some(ws) = workspace::Entity::find_by_id(id).one(&state.db).await? {
            return Ok(ws);
        }
    }
    let slug = ident.trim().to_lowercase();
    workspace::Entity::find()
        .filter(workspace::Column::Slug.eq(slug))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("workspace"))
}

async fn get_workspace_usage(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(ident): Path<String>,
) -> ApiResult<Json<AdminWorkspaceUsageView>> {
    require_admin(&auth)?;
    let ws = resolve_workspace(&state, &ident).await?;

    let Some(b) = state.billing.as_ref() else {
        return Ok(Json(AdminWorkspaceUsageView {
            workspace_id: ws.id,
            workspace_name: ws.name.clone(),
            workspace_slug: ws.slug.clone(),
            billing_workspace_id: ws.id,
            is_billing_customer: true,
            billing_enabled: false,
            plan: "free".to_owned(),
            events_used: 0.0,
            events_included: None,
            events_overage_allowed: false,
            monitors_used: billing::billing_monitor_count(&state, ws.id).await?,
            monitors_included: None,
            members_used: billing::billing_member_count(&state, ws.id).await?,
            members_included: None,
            current_period_end: None,
            usage_reset_at: None,
        }));
    };

    let billing_workspace_id = billing::billing_customer_workspace_id(&state, ws.id).await?;
    let cstate = billing::customer_state_for_billing(&state, ws.id).await?;
    let plan = cstate
        .active_subscription()
        .and_then(|sub| b.catalog.tier_for_product(&sub.product_id))
        .unwrap_or("free")
        .to_owned();

    let events_used = match b.catalog.meter_id("events") {
        Some(mid) => billing::effective_events_consumed(&state, ws.id, cstate.as_ref(), mid).await?,
        None => 0.0,
    };
    let events_ent = b.catalog.entitlement(&plan, "events");
    let monitors_ent = b.catalog.entitlement(&plan, "monitors");
    let members_ent = b.catalog.entitlement(&plan, "members");

    let current_period_end = cstate
        .active_subscription()
        .and_then(|sub| sub.current_period_end.as_deref())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok());

    let reset = billing::load_usage_reset(&state, ws.id).await?;

    Ok(Json(AdminWorkspaceUsageView {
        workspace_id: ws.id,
        workspace_name: ws.name.clone(),
        workspace_slug: ws.slug.clone(),
        billing_workspace_id,
        is_billing_customer: billing_workspace_id == ws.id,
        billing_enabled: true,
        plan,
        events_used,
        events_included: events_ent.as_ref().map(|e| e.included),
        events_overage_allowed: events_ent.as_ref().map(|e| e.overage_allowed).unwrap_or(false),
        monitors_used: billing::billing_monitor_count(&state, ws.id).await?,
        monitors_included: monitors_ent.as_ref().map(|e| e.included),
        members_used: billing::billing_member_count(&state, ws.id).await?,
        members_included: members_ent.as_ref().map(|e| e.included),
        current_period_end,
        usage_reset_at: reset.usage_reset_at.map(|d| d.fixed_offset()),
    }))
}

async fn reset_workspace_usage(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(ident): Path<String>,
) -> ApiResult<Json<AdminUsageResetResult>> {
    require_admin(&auth)?;
    let ws = resolve_workspace(&state, &ident).await?;
    let summary = billing::reset_workspace_usage(&state, ws.id).await?;
    Ok(Json(AdminUsageResetResult {
        workspace_id: ws.id,
        billing_workspace_id: summary.billing_workspace_id,
        events_consumed_before: summary.events_consumed_before,
        events_consumed_after: summary.events_consumed_after,
        polar_event_ingested: summary.polar_event_ingested,
    }))
}

fn require_admin(auth: &AuthUser) -> ApiResult<()> {
    if auth.user.is_admin {
        return Ok(());
    }
    Err(ApiError::Forbidden)
}

async fn load_log_buckets(state: &AppState) -> ApiResult<Vec<AdminLogBucketView>> {
    Ok(
        AdminLogBucketView::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT b.id,
                   b.name,
                   b.storage_uri,
                   b.region,
                   b.endpoint,
                   b.access_key_id,
                   (b.secret_access_key IS NOT NULL AND b.secret_access_key <> '') AS secret_configured,
                   b.enabled,
                   b.max_projects,
                   COUNT(p.id)::bigint AS project_count,
                   b.created_at,
                   b.updated_at
            FROM log_storage_buckets b
            LEFT JOIN log_projects p ON p.bucket_id = b.id
            GROUP BY b.id
            ORDER BY b.enabled DESC, project_count ASC, b.created_at ASC
            "#,
            Vec::<Value>::new(),
        ))
        .all(&state.db)
        .await?,
    )
}

async fn load_log_bucket(state: &AppState, bucket_id: Uuid) -> ApiResult<AdminLogBucketView> {
    AdminLogBucketView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT b.id,
               b.name,
               b.storage_uri,
               b.region,
               b.endpoint,
               b.access_key_id,
               (b.secret_access_key IS NOT NULL AND b.secret_access_key <> '') AS secret_configured,
               b.enabled,
               b.max_projects,
               COUNT(p.id)::bigint AS project_count,
               b.created_at,
               b.updated_at
        FROM log_storage_buckets b
        LEFT JOIN log_projects p ON p.bucket_id = b.id
        WHERE b.id = $1
        GROUP BY b.id
        "#,
        vec![bucket_id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("log storage bucket"))
}

fn clean_required(value: &str, label: &str) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::bad_request(format!("{label} required")));
    }
    Ok(value.to_owned())
}

fn clean_storage_uri(value: &str) -> ApiResult<String> {
    let value = clean_required(value, "storage uri")?
        .trim_end_matches('/')
        .to_owned();
    if value.starts_with("s3://") || value.starts_with("./") || value.starts_with('/') {
        return Ok(value);
    }
    Err(ApiError::bad_request(
        "storage uri must be s3://..., ./..., or an absolute path",
    ))
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().trim_end_matches('/').to_owned())
        .filter(|v| !v.is_empty())
}

fn admin_region_view(region: region::Model) -> AdminRegionView {
    AdminRegionView {
        id: region.id,
        slug: region.slug,
        name: region.name,
        enabled: region.enabled,
        heartbeat_at: region.heartbeat_at,
        version: region.version,
        capabilities: regions::capabilities(&region.capabilities),
        created_at: region.created_at,
        updated_at: region.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::require_admin;
    use crate::auth::AuthUser;
    use chrono::Utc;
    use entity::user;
    use uuid::Uuid;

    fn auth_user(email: &str, is_admin: bool) -> AuthUser {
        let now = Utc::now().fixed_offset();
        AuthUser {
            user: user::Model {
                id: Uuid::now_v7(),
                email: email.to_owned(),
                github_id: None,
                password_hash: "hash".to_owned(),
                is_admin,
                created_at: now,
                updated_at: now,
            },
            session_id: Uuid::now_v7(),
        }
    }

    #[test]
    fn admin_guard_uses_persisted_admin_flag() {
        assert!(require_admin(&auth_user("admin@example.com", true)).is_ok());
    }

    #[test]
    fn admin_guard_rejects_unflagged_user_even_with_admin_like_email() {
        assert!(require_admin(&auth_user("admin@example.com", false)).is_err());
    }
}
