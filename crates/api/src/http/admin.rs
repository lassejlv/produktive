use crate::{auth::require_platform_admin, error::ApiError, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use produktive_entity::{admin_audit_event, issue, member, organization, project, session, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, EntityTrait, FromQueryResult,
    IntoActiveModel, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set, Statement,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

const DEFAULT_LIMIT: u64 = 25;
const MAX_LIMIT: u64 = 100;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/session", get(admin_session))
        .route("/analytics/growth", get(growth_analytics))
        .route("/users", get(list_users))
        .route("/users/{id}", get(get_user))
        .route("/users/{id}/suspend", post(suspend_user))
        .route("/users/{id}/unsuspend", post(unsuspend_user))
        .route("/organizations", get(list_organizations))
        .route("/organizations/{id}", get(get_organization))
        .route("/organizations/{id}/suspend", post(suspend_organization))
        .route(
            "/organizations/{id}/unsuspend",
            post(unsuspend_organization),
        )
        .route("/audit-events", get(list_audit_events))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminSessionResponse {
    user: AdminUserIdentity,
    role: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminUserIdentity {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
}

async fn admin_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminSessionResponse>, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    Ok(Json(AdminSessionResponse {
        user: AdminUserIdentity {
            id: admin.user.id,
            name: admin.user.name,
            email: admin.user.email,
            image: admin.user.image,
        },
        role: admin.role,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrowthQuery {
    range: Option<String>,
    bucket: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrowthResponse {
    range: String,
    bucket: String,
    totals: GrowthTotals,
    points: Vec<GrowthPoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrowthTotals {
    users: u64,
    organizations: u64,
    suspended_users: u64,
    suspended_organizations: u64,
}

#[derive(Serialize, FromQueryResult)]
#[serde(rename_all = "camelCase")]
struct GrowthPoint {
    bucket: String,
    users: i64,
    organizations: i64,
}

async fn growth_analytics(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<Json<GrowthResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let range = match query.range.as_deref() {
        Some("90d") => "90d",
        Some("12m") => "12m",
        _ => "30d",
    };
    let bucket = match query.bucket.as_deref() {
        Some("week") => "week",
        Some("month") => "month",
        _ if range == "12m" => "month",
        _ => "day",
    };
    let since = match range {
        "12m" => Utc::now().fixed_offset() - Duration::days(365),
        "90d" => Utc::now().fixed_offset() - Duration::days(90),
        _ => Utc::now().fixed_offset() - Duration::days(30),
    };

    let trunc = match bucket {
        "month" => "month",
        "week" => "week",
        _ => "day",
    };
    let date_format = if trunc == "month" {
        "YYYY-MM"
    } else {
        "YYYY-MM-DD"
    };
    let sql = format!(
        r#"
        with user_counts as (
            select date_trunc('{trunc}', created_at) as bucket, count(*)::bigint as users
            from users
            where created_at >= $1
            group by 1
        ),
        org_counts as (
            select date_trunc('{trunc}', created_at) as bucket, count(*)::bigint as organizations
            from organizations
            where created_at >= $1
            group by 1
        )
        select to_char(coalesce(user_counts.bucket, org_counts.bucket), '{date_format}') as bucket,
               coalesce(user_counts.users, 0)::bigint as users,
               coalesce(org_counts.organizations, 0)::bigint as organizations
        from user_counts
        full outer join org_counts on user_counts.bucket = org_counts.bucket
        order by coalesce(user_counts.bucket, org_counts.bucket) asc
        "#
    );
    let points = GrowthPoint::find_by_statement(Statement::from_sql_and_values(
        state.db.get_database_backend(),
        sql,
        [since.into()],
    ))
    .all(&state.db)
    .await?;

    Ok(Json(GrowthResponse {
        range: range.to_owned(),
        bucket: bucket.to_owned(),
        totals: GrowthTotals {
            users: user::Entity::find().count(&state.db).await?,
            organizations: organization::Entity::find().count(&state.db).await?,
            suspended_users: user::Entity::find()
                .filter(user::Column::SuspendedAt.is_not_null())
                .count(&state.db)
                .await?,
            suspended_organizations: organization::Entity::find()
                .filter(organization::Column::SuspendedAt.is_not_null())
                .count(&state.db)
                .await?,
        },
        points,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    search: Option<String>,
    status: Option<String>,
    page: Option<u64>,
    limit: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    page: u64,
    limit: u64,
    total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsersResponse {
    users: Vec<AdminUserSummary>,
    page: PageInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminUserSummary {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
    email_verified: bool,
    organization_count: u64,
    suspended_at: Option<String>,
    suspension_reason: Option<String>,
    created_at: String,
    last_session_at: Option<String>,
}

async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Result<Json<UsersResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let (page, limit, offset) = pagination(&query);
    let condition = user_condition(&query);
    let total = user::Entity::find()
        .filter(condition.clone())
        .count(&state.db)
        .await?;
    let rows = user::Entity::find()
        .filter(condition)
        .order_by_desc(user::Column::CreatedAt)
        .limit(limit)
        .offset(offset)
        .all(&state.db)
        .await?;

    let mut users = Vec::with_capacity(rows.len());
    for row in rows {
        users.push(user_summary(&state, row).await?);
    }

    Ok(Json(UsersResponse {
        users,
        page: PageInfo { page, limit, total },
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserDetailResponse {
    user: AdminUserSummary,
    memberships: Vec<UserMembershipResponse>,
    active_sessions: u64,
    audit_events: Vec<AuditEventResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserMembershipResponse {
    organization_id: String,
    organization_name: String,
    organization_slug: String,
    role: String,
    joined_at: String,
    organization_suspended_at: Option<String>,
}

async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<UserDetailResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let row = user::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("User not found".to_owned()))?;
    let memberships = member::Entity::find()
        .filter(member::Column::UserId.eq(&id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await?;
    let mut membership_responses = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(org) = organization::Entity::find_by_id(&membership.organization_id)
            .one(&state.db)
            .await?
        {
            membership_responses.push(UserMembershipResponse {
                organization_id: org.id,
                organization_name: org.name,
                organization_slug: org.slug,
                role: membership.role,
                joined_at: membership.created_at.to_rfc3339(),
                organization_suspended_at: org.suspended_at.map(|value| value.to_rfc3339()),
            });
        }
    }

    let active_sessions = session::Entity::find()
        .filter(session::Column::UserId.eq(&id))
        .filter(session::Column::RevokedAt.is_null())
        .count(&state.db)
        .await?;
    let audit_events = recent_audit_events(&state, "user", &id).await?;
    let user = user_summary(&state, row).await?;

    Ok(Json(UserDetailResponse {
        user,
        memberships: membership_responses,
        active_sessions,
        audit_events,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationsResponse {
    organizations: Vec<AdminOrganizationSummary>,
    page: PageInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminOrganizationSummary {
    id: String,
    name: String,
    slug: String,
    image: Option<String>,
    member_count: u64,
    owner_count: u64,
    issue_count: u64,
    project_count: u64,
    suspended_at: Option<String>,
    suspension_reason: Option<String>,
    created_at: String,
}

async fn list_organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Result<Json<OrganizationsResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let (page, limit, offset) = pagination(&query);
    let condition = organization_condition(&query);
    let total = organization::Entity::find()
        .filter(condition.clone())
        .count(&state.db)
        .await?;
    let rows = organization::Entity::find()
        .filter(condition)
        .order_by_desc(organization::Column::CreatedAt)
        .limit(limit)
        .offset(offset)
        .all(&state.db)
        .await?;
    let mut organizations = Vec::with_capacity(rows.len());
    for row in rows {
        organizations.push(organization_summary(&state, row).await?);
    }
    Ok(Json(OrganizationsResponse {
        organizations,
        page: PageInfo { page, limit, total },
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationDetailResponse {
    organization: AdminOrganizationSummary,
    members: Vec<OrganizationMemberResponse>,
    audit_events: Vec<AuditEventResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationMemberResponse {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
    role: String,
    joined_at: String,
    suspended_at: Option<String>,
}

async fn get_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<OrganizationDetailResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let row = organization::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".to_owned()))?;
    let memberships = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await?;
    let mut members = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(row) = user::Entity::find_by_id(&membership.user_id)
            .one(&state.db)
            .await?
        {
            members.push(OrganizationMemberResponse {
                id: row.id,
                name: row.name,
                email: row.email,
                image: row.image,
                role: membership.role,
                joined_at: membership.created_at.to_rfc3339(),
                suspended_at: row.suspended_at.map(|value| value.to_rfc3339()),
            });
        }
    }
    let audit_events = recent_audit_events(&state, "organization", &id).await?;
    let organization = organization_summary(&state, row).await?;
    Ok(Json(OrganizationDetailResponse {
        organization,
        members,
        audit_events,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuspensionRequest {
    reason: String,
    note: Option<String>,
}

async fn suspend_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<SuspensionRequest>,
) -> Result<StatusCode, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    if id == admin.user.id {
        return Err(ApiError::BadRequest(
            "Platform admins cannot suspend their own account".to_owned(),
        ));
    }
    let reason = validate_reason(&payload.reason)?;
    let now = Utc::now().fixed_offset();
    let row = user::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("User not found".to_owned()))?;
    let mut active = row.into_active_model();
    active.suspended_at = Set(Some(now));
    active.suspended_by_id = Set(Some(admin.user.id.clone()));
    active.suspension_reason = Set(Some(reason.clone()));
    active.suspension_note = Set(clean_note(payload.note));
    active.updated_at = Set(now);
    active.update(&state.db).await?;

    revoke_user_sessions_for_admin(&state, &id, None).await?;
    audit(
        &state,
        &admin.user.id,
        "user.suspend",
        "user",
        &id,
        Some(&reason),
        json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn unsuspend_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    let row = user::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("User not found".to_owned()))?;
    let mut active = row.into_active_model();
    active.suspended_at = Set(None);
    active.suspended_by_id = Set(None);
    active.suspension_reason = Set(None);
    active.suspension_note = Set(None);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await?;
    audit(
        &state,
        &admin.user.id,
        "user.unsuspend",
        "user",
        &id,
        None,
        json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn suspend_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<SuspensionRequest>,
) -> Result<StatusCode, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    let reason = validate_reason(&payload.reason)?;
    let now = Utc::now().fixed_offset();
    let row = organization::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".to_owned()))?;
    let mut active = row.into_active_model();
    active.suspended_at = Set(Some(now));
    active.suspended_by_id = Set(Some(admin.user.id.clone()));
    active.suspension_reason = Set(Some(reason.clone()));
    active.suspension_note = Set(clean_note(payload.note));
    active.updated_at = Set(now);
    active.update(&state.db).await?;

    revoke_user_sessions_for_admin(&state, "", Some(&id)).await?;
    audit(
        &state,
        &admin.user.id,
        "organization.suspend",
        "organization",
        &id,
        Some(&reason),
        json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn unsuspend_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    let row = organization::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".to_owned()))?;
    let mut active = row.into_active_model();
    active.suspended_at = Set(None);
    active.suspended_by_id = Set(None);
    active.suspension_reason = Set(None);
    active.suspension_note = Set(None);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await?;
    audit(
        &state,
        &admin.user.id,
        "organization.unsuspend",
        "organization",
        &id,
        None,
        json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditQuery {
    target_type: Option<String>,
    target_id: Option<String>,
    action: Option<String>,
    page: Option<u64>,
    limit: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditEventsResponse {
    events: Vec<AuditEventResponse>,
    page: PageInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditEventResponse {
    id: String,
    actor: AdminUserIdentity,
    action: String,
    target_type: String,
    target_id: String,
    reason: Option<String>,
    created_at: String,
}

async fn list_audit_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditQuery>,
) -> Result<Json<AuditEventsResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let (page, limit, offset) = audit_pagination(&query);
    let condition = audit_condition(&query);
    let total = admin_audit_event::Entity::find()
        .filter(condition.clone())
        .count(&state.db)
        .await?;
    let rows = admin_audit_event::Entity::find()
        .filter(condition)
        .order_by_desc(admin_audit_event::Column::CreatedAt)
        .limit(limit)
        .offset(offset)
        .all(&state.db)
        .await?;
    let mut events = Vec::with_capacity(rows.len());
    for row in rows {
        events.push(audit_response(&state, row).await?);
    }
    Ok(Json(AuditEventsResponse {
        events,
        page: PageInfo { page, limit, total },
    }))
}

fn pagination(query: &ListQuery) -> (u64, u64, u64) {
    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = (page - 1) * limit;
    (page, limit, offset)
}

fn audit_pagination(query: &AuditQuery) -> (u64, u64, u64) {
    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = (page - 1) * limit;
    (page, limit, offset)
}

fn user_condition(query: &ListQuery) -> Condition {
    let mut condition = Condition::all();
    if let Some(search) = clean_search(query.search.as_deref()) {
        condition = condition.add(
            Condition::any()
                .add(user::Column::Name.contains(&search))
                .add(user::Column::Email.contains(&search)),
        );
    }
    match query.status.as_deref() {
        Some("suspended") => condition.add(user::Column::SuspendedAt.is_not_null()),
        Some("active") => condition.add(user::Column::SuspendedAt.is_null()),
        _ => condition,
    }
}

fn organization_condition(query: &ListQuery) -> Condition {
    let mut condition = Condition::all();
    if let Some(search) = clean_search(query.search.as_deref()) {
        condition = condition.add(
            Condition::any()
                .add(organization::Column::Name.contains(&search))
                .add(organization::Column::Slug.contains(&search)),
        );
    }
    match query.status.as_deref() {
        Some("suspended") => condition.add(organization::Column::SuspendedAt.is_not_null()),
        Some("active") => condition.add(organization::Column::SuspendedAt.is_null()),
        _ => condition,
    }
}

fn audit_condition(query: &AuditQuery) -> Condition {
    let mut condition = Condition::all();
    if let Some(value) = clean_search(query.target_type.as_deref()) {
        condition = condition.add(admin_audit_event::Column::TargetType.eq(value));
    }
    if let Some(value) = clean_search(query.target_id.as_deref()) {
        condition = condition.add(admin_audit_event::Column::TargetId.eq(value));
    }
    if let Some(value) = clean_search(query.action.as_deref()) {
        condition = condition.add(admin_audit_event::Column::Action.eq(value));
    }
    condition
}

fn clean_search(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

async fn user_summary(state: &AppState, row: user::Model) -> Result<AdminUserSummary, ApiError> {
    let organization_count = member::Entity::find()
        .filter(member::Column::UserId.eq(&row.id))
        .count(&state.db)
        .await?;
    let last_session_at = session::Entity::find()
        .filter(session::Column::UserId.eq(&row.id))
        .order_by_desc(session::Column::UpdatedAt)
        .one(&state.db)
        .await?
        .map(|session| session.updated_at.to_rfc3339());
    Ok(AdminUserSummary {
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        email_verified: row.email_verified,
        organization_count,
        suspended_at: row.suspended_at.map(|value| value.to_rfc3339()),
        suspension_reason: row.suspension_reason,
        created_at: row.created_at.to_rfc3339(),
        last_session_at,
    })
}

async fn organization_summary(
    state: &AppState,
    row: organization::Model,
) -> Result<AdminOrganizationSummary, ApiError> {
    let member_count = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&row.id))
        .count(&state.db)
        .await?;
    let owner_count = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&row.id))
        .filter(member::Column::Role.eq("owner"))
        .count(&state.db)
        .await?;
    let issue_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.id))
        .count(&state.db)
        .await?;
    let project_count = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(&row.id))
        .count(&state.db)
        .await?;
    Ok(AdminOrganizationSummary {
        id: row.id,
        name: row.name,
        slug: row.slug,
        image: row.image,
        member_count,
        owner_count,
        issue_count,
        project_count,
        suspended_at: row.suspended_at.map(|value| value.to_rfc3339()),
        suspension_reason: row.suspension_reason,
        created_at: row.created_at.to_rfc3339(),
    })
}

fn validate_reason(input: &str) -> Result<String, ApiError> {
    let reason = input.trim();
    if reason.is_empty() {
        return Err(ApiError::BadRequest(
            "Suspension reason is required".to_owned(),
        ));
    }
    if reason.chars().count() > 160 {
        return Err(ApiError::BadRequest(
            "Suspension reason must be 160 characters or fewer".to_owned(),
        ));
    }
    Ok(reason.to_owned())
}

fn clean_note(input: Option<String>) -> Option<String> {
    input
        .map(|value| value.trim().chars().take(1_000).collect::<String>())
        .filter(|value| !value.is_empty())
}

async fn revoke_user_sessions_for_admin(
    state: &AppState,
    user_id: &str,
    organization_id: Option<&str>,
) -> Result<(), ApiError> {
    let now = Utc::now().fixed_offset();
    let mut query = session::Entity::find().filter(session::Column::RevokedAt.is_null());
    if !user_id.is_empty() {
        query = query.filter(session::Column::UserId.eq(user_id));
    }
    if let Some(organization_id) = organization_id {
        query = query.filter(session::Column::ActiveOrganizationId.eq(organization_id));
    }
    let rows = query.all(&state.db).await?;
    for row in rows {
        let mut active = row.into_active_model();
        active.revoked_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    }
    Ok(())
}

async fn audit(
    state: &AppState,
    actor_user_id: &str,
    action: &str,
    target_type: &str,
    target_id: &str,
    reason: Option<&str>,
    metadata: serde_json::Value,
) -> Result<(), ApiError> {
    admin_audit_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        actor_user_id: Set(actor_user_id.to_owned()),
        action: Set(action.to_owned()),
        target_type: Set(target_type.to_owned()),
        target_id: Set(target_id.to_owned()),
        reason: Set(reason.map(ToOwned::to_owned)),
        metadata: Set(metadata),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn recent_audit_events(
    state: &AppState,
    target_type: &str,
    target_id: &str,
) -> Result<Vec<AuditEventResponse>, ApiError> {
    let rows = admin_audit_event::Entity::find()
        .filter(admin_audit_event::Column::TargetType.eq(target_type))
        .filter(admin_audit_event::Column::TargetId.eq(target_id))
        .order_by_desc(admin_audit_event::Column::CreatedAt)
        .limit(20)
        .all(&state.db)
        .await?;
    let mut events = Vec::with_capacity(rows.len());
    for row in rows {
        events.push(audit_response(state, row).await?);
    }
    Ok(events)
}

async fn audit_response(
    state: &AppState,
    row: admin_audit_event::Model,
) -> Result<AuditEventResponse, ApiError> {
    let actor = user::Entity::find_by_id(&row.actor_user_id)
        .one(&state.db)
        .await?
        .map(|actor| AdminUserIdentity {
            id: actor.id,
            name: actor.name,
            email: actor.email,
            image: actor.image,
        })
        .unwrap_or_else(|| AdminUserIdentity {
            id: row.actor_user_id.clone(),
            name: "Deleted user".to_owned(),
            email: "unknown".to_owned(),
            image: None,
        });
    Ok(AuditEventResponse {
        id: row.id,
        actor,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        reason: row.reason,
        created_at: row.created_at.to_rfc3339(),
    })
}
