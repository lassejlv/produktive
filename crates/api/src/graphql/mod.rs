use crate::{
    auth::{
        auth_cookie, create_organization_for_user, ensure_fresh_two_factor,
        ensure_organization_not_suspended, require_auth_without_two_factor_policy,
        set_session_active_organization, user_is_member, AuthContext,
    },
    error::ApiError,
    http::{chats, inbox, issue_statuses, labels, preferences, projects},
    permissions::{
        require_permission, ROLE_OWNER, WORKSPACE_DELETE, WORKSPACE_RENAME, WORKSPACE_SECURITY,
    },
    realtime::{RealtimeAction, RealtimeEntity},
    security_events::{
        metadata_empty, record_security_event, SecurityEventInput, EVENT_WORKSPACE_DELETED,
        EVENT_WORKSPACE_REQUIRE_2FA_DISABLED, EVENT_WORKSPACE_REQUIRE_2FA_ENABLED,
    },
    state::AppState,
};
use async_graphql::{Context, EmptySubscription, InputObject, Json, Object, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, Method},
    routing::post,
    Json as AxumJson, Router,
};
use produktive_entity::{
    chat, chat_access, issue, label, member, notification, organization, project, session, user,
    user_tab,
};
use sea_orm::{
    sea_query::OnConflict, ActiveModelTrait, ColumnTrait, Condition, EntityTrait, IntoActiveModel,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use uuid::Uuid;

pub type AppSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;
const MAX_INTERNAL_BRIDGE_CALLS_PER_OPERATION: usize = 4;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", post(graphql_handler))
}

fn schema(disable_introspection: bool) -> AppSchema {
    let builder = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .limit_depth(12)
        .limit_complexity(512);
    if disable_introspection {
        builder.disable_introspection().finish()
    } else {
        builder.finish()
    }
}

async fn graphql_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: GraphQLRequest,
) -> GraphQLResponse {
    let mut request = request
        .into_inner()
        .data(state.clone())
        .data(headers.clone())
        .data(InternalBridgeBudget::default());
    match require_auth_without_two_factor_policy(&headers, &state).await {
        Ok(auth) => {
            request = request.data(auth);
            schema(state.config.is_production_like())
                .execute(request)
                .await
                .into()
        }
        Err(ApiError::Unauthorized) => schema(state.config.is_production_like())
            .execute(request)
            .await
            .into(),
        Err(error) => async_graphql::Response::from_errors(vec![async_graphql::ServerError::new(
            error.to_string(),
            None,
        )])
        .into(),
    }
}

fn state<'ctx>(ctx: &'ctx Context<'ctx>) -> async_graphql::Result<&'ctx AppState> {
    ctx.data::<AppState>()
}

fn auth<'ctx>(ctx: &'ctx Context<'ctx>) -> async_graphql::Result<&'ctx AuthContext> {
    let auth = ctx.data::<AuthContext>()?;
    if auth.organization.require_two_factor && !auth.user.two_factor_enabled {
        return Err(graphql_error(ApiError::Forbidden(
            "Two-factor authentication is required for this workspace".to_owned(),
        )));
    }
    Ok(auth)
}

fn relaxed_auth<'ctx>(ctx: &'ctx Context<'ctx>) -> async_graphql::Result<&'ctx AuthContext> {
    ctx.data::<AuthContext>()
}

fn headers<'ctx>(ctx: &'ctx Context<'ctx>) -> async_graphql::Result<&'ctx HeaderMap> {
    ctx.data::<HeaderMap>()
}

fn graphql_error(error: ApiError) -> async_graphql::Error {
    async_graphql::Error::new(error.to_string())
}

fn to_json<T: Serialize>(value: T) -> async_graphql::Result<Json<Value>> {
    serde_json::to_value(value)
        .map(Json)
        .map_err(|error| async_graphql::Error::new(error.to_string()))
}

fn map_api<T>(result: Result<T, ApiError>) -> async_graphql::Result<T> {
    result.map_err(graphql_error)
}

#[derive(Clone, Default)]
struct InternalBridgeBudget(Arc<AtomicUsize>);

impl InternalBridgeBudget {
    fn take(&self) -> async_graphql::Result<()> {
        let previous = self.0.fetch_add(1, Ordering::Relaxed);
        if previous >= MAX_INTERNAL_BRIDGE_CALLS_PER_OPERATION {
            return Err(async_graphql::Error::new(
                "Too many internal GraphQL bridge calls",
            ));
        }
        Ok(())
    }
}

fn bridge_budget<'ctx>(
    ctx: &'ctx Context<'ctx>,
) -> async_graphql::Result<&'ctx InternalBridgeBudget> {
    ctx.data::<InternalBridgeBudget>()
}

fn internal_api_url(
    state: &AppState,
    method: &Method,
    path: &str,
) -> async_graphql::Result<String> {
    let path = normalize_internal_api_path(method, path)?;
    Ok(format!("http://127.0.0.1:{}{}", state.config.port, path))
}

fn normalize_internal_api_path<'a>(
    method: &Method,
    path: &'a str,
) -> async_graphql::Result<&'a str> {
    let path = path.trim();
    if !path.starts_with("/api/") {
        return Err(async_graphql::Error::new(
            "Internal GraphQL bridge path must start with /api/",
        ));
    }
    if !is_internal_graphql_bridge_path(method, path) {
        return Err(async_graphql::Error::new(
            "Path is not available through the internal GraphQL API",
        ));
    }
    Ok(path)
}

fn is_internal_graphql_bridge_path(method: &Method, path: &str) -> bool {
    let path = path.split('#').next().unwrap_or(path);
    let path_only = path.split('?').next().unwrap_or(path);
    matches!(
        (method.as_str(), path_only),
        ("GET", "/api/notes")
            | ("POST", "/api/notes")
            | ("GET", "/api/notes/folders")
            | ("POST", "/api/notes/folders")
            | ("GET", "/api/notes/mentions")
            | ("GET", "/api/ai/models")
            | ("POST", "/api/ai/workspace-brief")
            | ("POST", "/api/ai/issue-draft")
            | ("GET", "/api/ai/mcp/servers")
            | ("POST", "/api/ai/mcp/servers")
            | ("GET", "/api/api-keys/keys")
            | ("POST", "/api/api-keys/keys")
            | ("GET", "/api/github/connection")
            | ("DELETE", "/api/github/connection")
            | ("GET", "/api/github/repositories")
            | ("POST", "/api/github/repositories")
            | ("GET", "/api/github/repository-search")
            | ("POST", "/api/github/import/preview")
            | ("POST", "/api/github/import")
            | ("GET", "/api/slack/connection")
            | ("PATCH", "/api/slack/connection")
            | ("DELETE", "/api/slack/connection")
            | ("GET", "/api/organizations/me/invitations")
            | ("POST", "/api/organizations/me/invitations")
            | ("GET", "/api/security/events")
            | ("POST", "/api/security/two-factor-nudges")
            | ("POST", "/api/security/two-factor-enforcement/blocked")
            | ("POST", "/api/security/two-factor-recovery/reset")
            | ("POST", "/api/security/member-sessions/revoke")
            | ("GET", "/api/roles")
            | ("POST", "/api/roles")
            | ("GET", "/api/favorites")
            | ("POST", "/api/favorites")
            | ("POST", "/api/favorites/reorder")
    ) || matches!(method.as_str(), "GET" | "PATCH" | "DELETE" | "POST")
        && matches_dynamic_internal_graphql_bridge_path(method, path_only)
}

fn matches_dynamic_internal_graphql_bridge_path(method: &Method, path: &str) -> bool {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    match (method.as_str(), parts.as_slice()) {
        ("GET" | "PATCH" | "DELETE", ["api", "notes", id]) => !id.is_empty(),
        ("GET", ["api", "notes", id, "versions"]) => !id.is_empty(),
        ("POST", ["api", "notes", id, "commit"]) => !id.is_empty(),
        ("POST", ["api", "notes", id, "versions", version_id, "restore"]) => {
            !id.is_empty() && !version_id.is_empty()
        }
        ("POST", ["api", "notes", id, "ai", "edit"]) => !id.is_empty(),
        ("PATCH" | "DELETE", ["api", "notes", "folders", id]) => !id.is_empty(),
        ("GET", ["api", "issues", id, "history"])
        | ("GET", ["api", "issues", id, "comments"])
        | ("POST", ["api", "issues", id, "comments"])
        | ("GET", ["api", "issues", id, "subscribers"])
        | ("POST", ["api", "issues", id, "subscribers"])
        | ("DELETE", ["api", "issues", id, "subscribers"]) => !id.is_empty(),
        ("PATCH", ["api", "me", "onboarding"]) => true,
        ("POST", ["api", "ai", "projects", project_id, "health"]) => !project_id.is_empty(),
        ("PATCH" | "DELETE", ["api", "ai", "mcp", "servers", id]) => !id.is_empty(),
        ("POST", ["api", "ai", "mcp", "servers", id, "refresh-tools"]) => !id.is_empty(),
        ("DELETE", ["api", "api-keys", "keys", id])
        | ("DELETE", ["api", "api-keys", "keys", id, "delete"]) => !id.is_empty(),
        ("PATCH" | "DELETE", ["api", "github", "repositories", id]) => !id.is_empty(),
        ("POST", ["api", "github", "repositories", id, "preview"])
        | ("POST", ["api", "github", "repositories", id, "import"]) => !id.is_empty(),
        ("DELETE", ["api", "organizations", "me", "invitations", id]) => !id.is_empty(),
        ("POST", ["api", "organizations", "me", "invitations", id, "resend"]) => !id.is_empty(),
        ("GET" | "PATCH" | "DELETE", ["api", "members", id]) => !id.is_empty(),
        ("PATCH" | "DELETE", ["api", "roles", id]) => !id.is_empty(),
        ("DELETE", ["api", "favorites", "by", target_type, target_id]) => {
            matches!(*target_type, "chat" | "issue" | "project") && !target_id.is_empty()
        }
        _ => false,
    }
}

async fn execute_internal_api_request(
    state: &AppState,
    headers: &HeaderMap,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> async_graphql::Result<Json<Value>> {
    let url = internal_api_url(state, &method, path)?;
    let client = reqwest::Client::new();
    let mut request = client.request(method, url);
    if let Some(cookie) = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
    {
        request = request.header(reqwest::header::COOKIE, cookie);
    }
    if let Some(authorization) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    {
        request = request.header(reqwest::header::AUTHORIZATION, authorization);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| async_graphql::Error::new(error.to_string()))?;
    let status = response.status();
    if status == reqwest::StatusCode::NO_CONTENT {
        return Ok(Json(json!(null)));
    }
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| async_graphql::Error::new(error.to_string()))?;
    if !status.is_success() {
        let message = payload
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Internal API request failed");
        return Err(async_graphql::Error::new(message));
    }
    Ok(Json(payload))
}

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn session(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<Json<Value>>> {
        let Some(auth) = ctx.data_opt::<AuthContext>() else {
            return Ok(None);
        };
        to_json(auth.response()).map(Some)
    }

    async fn me(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        to_json(auth(ctx)?.response())
    }

    async fn issues(
        &self,
        ctx: &Context<'_>,
        status: Option<String>,
        project_id: Option<String>,
        label_ids: Option<Vec<String>>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let mut select = issue::Entity::find()
            .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
            .order_by_desc(issue::Column::CreatedAt);

        if let Some(status) = status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            select = select.filter(issue::Column::Status.eq(status));
        }
        if let Some(project_id) = project_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            select = select.filter(issue::Column::ProjectId.eq(project_id));
        }
        if let Some(label_ids) = label_ids {
            let label_ids: Vec<String> = label_ids
                .into_iter()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
                .collect();
            if !label_ids.is_empty() {
                let join_rows = produktive_entity::issue_label::Entity::find()
                    .filter(produktive_entity::issue_label::Column::LabelId.is_in(label_ids))
                    .all(&state.db)
                    .await
                    .map_err(ApiError::from)
                    .map_err(graphql_error)?;
                let issue_ids: Vec<String> =
                    join_rows.into_iter().map(|row| row.issue_id).collect();
                if issue_ids.is_empty() {
                    return to_json(json!({ "issues": [] }));
                }
                select = select.filter(issue::Column::Id.is_in(issue_ids));
            }
        }

        let rows = select
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let mut issues = Vec::with_capacity(rows.len());
        for row in rows {
            issues.push(map_api(
                crate::http::issues::issue_response(state, row).await,
            )?);
        }
        to_json(json!({ "issues": issues }))
    }

    async fn issue(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let row =
            map_api(crate::http::issues::find_issue(state, &auth.organization.id, &id).await)?;
        to_json(json!({ "issue": map_api(crate::http::issues::issue_response(state, row).await)? }))
    }

    async fn projects(
        &self,
        ctx: &Context<'_>,
        include_archived: Option<bool>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let mut select = project::Entity::find()
            .filter(project::Column::OrganizationId.eq(&auth.organization.id))
            .order_by_asc(project::Column::ArchivedAt)
            .order_by_asc(project::Column::SortOrder)
            .order_by_desc(project::Column::CreatedAt);
        if !include_archived.unwrap_or(false) {
            select = select.filter(project::Column::ArchivedAt.is_null());
        }
        let rows = select
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let mut projects = Vec::with_capacity(rows.len());
        for row in rows {
            projects.push(map_api(projects::project_response(state, row).await)?);
        }
        to_json(json!({ "projects": projects }))
    }

    async fn project(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let row = map_api(projects::find_project(state, &auth.organization.id, &id).await)?;
        to_json(json!({ "project": map_api(projects::project_response(state, row).await)? }))
    }

    async fn labels(
        &self,
        ctx: &Context<'_>,
        include_archived: Option<bool>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let mut select = label::Entity::find()
            .filter(label::Column::OrganizationId.eq(&auth.organization.id))
            .order_by_asc(label::Column::Name);
        if !include_archived.unwrap_or(false) {
            select = select.filter(label::Column::ArchivedAt.is_null());
        }
        let rows = select
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let mut labels = Vec::with_capacity(rows.len());
        for row in rows {
            labels.push(map_api(labels::label_response(state, row).await)?);
        }
        to_json(json!({ "labels": labels }))
    }

    async fn label(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let row = map_api(labels::find_label(state, &auth.organization.id, &id).await)?;
        to_json(json!({ "label": map_api(labels::label_response(state, row).await)? }))
    }

    async fn issue_statuses(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        to_json(json!({
            "statuses": map_api(issue_statuses::list_issue_statuses(state, &auth.organization.id, false).await)?
        }))
    }

    async fn members(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let rows = member::Entity::find()
            .filter(member::Column::OrganizationId.eq(&auth.organization.id))
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let mut members = Vec::with_capacity(rows.len());
        for row in rows {
            if let Some(user) = user::Entity::find_by_id(&row.user_id)
                .one(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?
            {
                let active_sessions = session::Entity::find()
                    .filter(session::Column::UserId.eq(&user.id))
                    .filter(session::Column::ActiveOrganizationId.eq(&auth.organization.id))
                    .filter(session::Column::RevokedAt.is_null())
                    .filter(session::Column::ExpiresAt.gt(chrono::Utc::now().fixed_offset()))
                    .count(&state.db)
                    .await
                    .map_err(ApiError::from)
                    .map_err(graphql_error)?;
                members.push(json!({
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "image": user.image,
                    "role": row.role,
                    "twoFactorEnabled": user.two_factor_enabled,
                    "activeSessions": active_sessions,
                }));
            }
        }
        to_json(json!({ "members": members }))
    }

    async fn inbox(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let rows = notification::Entity::find()
            .filter(notification::Column::OrganizationId.eq(&auth.organization.id))
            .filter(notification::Column::UserId.eq(&auth.user.id))
            .order_by_desc(notification::Column::CreatedAt)
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let mut notifications = Vec::with_capacity(rows.len());
        let mut unread_count = 0_u64;
        for row in rows {
            if row.read_at.is_none() {
                unread_count += 1;
            }
            notifications.push(map_api(inbox::notification_response(state, row).await)?);
        }
        to_json(json!({ "notifications": notifications, "unreadCount": unread_count }))
    }

    async fn preferences(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let prefs = map_api(preferences::for_user(state, &auth.user.id).await)?;
        to_json(preferences::PreferencesResponse::from(prefs))
    }

    async fn tabs(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let rows = user_tab::Entity::find()
            .filter(user_tab::Column::UserId.eq(&auth.user.id))
            .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
            .order_by_asc(user_tab::Column::OpenedAt)
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        to_json(
            rows.into_iter()
                .map(crate::http::tabs::TabResponse::from)
                .collect::<Vec<_>>(),
        )
    }

    async fn chats(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let accessible_ids = accessible_chat_ids(state, auth).await?;
        if accessible_ids.is_empty() {
            return to_json(json!({ "chats": [] }));
        }

        let rows = chat::Entity::find()
            .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
            .filter(chat::Column::Id.is_in(accessible_ids))
            .order_by_desc(chat::Column::UpdatedAt)
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let chats: Vec<_> = rows
            .into_iter()
            .map(|chat| {
                json!({
                    "id": chat.id,
                    "title": chat.title,
                    "createdById": chat.created_by_id,
                    "createdAt": chat.created_at.to_rfc3339(),
                    "updatedAt": chat.updated_at.to_rfc3339(),
                })
            })
            .collect();
        to_json(json!({ "chats": chats }))
    }

    async fn account_sessions(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = relaxed_auth(ctx)?;
        let now = chrono::Utc::now().fixed_offset();
        let rows = session::Entity::find()
            .filter(session::Column::UserId.eq(&auth.user.id))
            .filter(session::Column::RevokedAt.is_null())
            .filter(session::Column::ExpiresAt.gt(now))
            .order_by_desc(session::Column::UpdatedAt)
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let mut sessions = Vec::with_capacity(rows.len());
        for row in rows {
            let active_organization_name =
                organization::Entity::find_by_id(&row.active_organization_id)
                    .one(&state.db)
                    .await
                    .map_err(ApiError::from)
                    .map_err(graphql_error)?
                    .map(|organization| organization.name);
            sessions.push(json!({
                "id": row.id,
                "current": row.id == auth.session.id,
                "activeOrganizationId": row.active_organization_id,
                "activeOrganizationName": active_organization_name,
                "expiresAt": row.expires_at,
                "createdAt": row.created_at,
                "updatedAt": row.updated_at,
            }));
        }

        to_json(json!({ "sessions": sessions }))
    }

    async fn organizations(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = relaxed_auth(ctx)?;
        let memberships = member::Entity::find()
            .filter(member::Column::UserId.eq(&auth.user.id))
            .order_by_asc(member::Column::CreatedAt)
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let mut organizations = Vec::with_capacity(memberships.len());
        for membership in memberships {
            if let Some(org) = organization::Entity::find_by_id(&membership.organization_id)
                .one(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?
            {
                organizations.push(json!({
                    "id": org.id,
                    "name": org.name,
                    "slug": org.slug,
                    "image": org.image,
                    "role": membership.role,
                }));
            }
        }

        to_json(json!({
            "organizations": organizations,
            "activeOrganizationId": auth.organization.id,
        }))
    }

    async fn internal_json(
        &self,
        ctx: &Context<'_>,
        path: String,
    ) -> async_graphql::Result<Json<Value>> {
        bridge_budget(ctx)?.take()?;
        execute_internal_api_request(state(ctx)?, headers(ctx)?, Method::GET, &path, None).await
    }

    async fn chat(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) =
            map_api(chats::get_chat_with_messages(State(state), headers, Path(id)).await)?;
        to_json(envelope)
    }

    async fn chat_access(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) =
            map_api(chats::list_access(State(state), headers, Path(id)).await)?;
        to_json(envelope)
    }
}

pub struct MutationRoot;

#[derive(InputObject)]
struct CreateIssueInput {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    parent_id: Option<String>,
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
}

#[derive(InputObject)]
struct UpdateIssueInput {
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
}

#[derive(InputObject)]
struct CreateProjectInput {
    name: String,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
}

#[derive(InputObject)]
struct UpdateProjectInput {
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
    archived: Option<bool>,
}

#[derive(InputObject)]
struct CreateLabelInput {
    name: String,
    description: Option<String>,
    color: Option<String>,
}

#[derive(InputObject)]
struct UpdateLabelInput {
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    archived: Option<bool>,
}

#[derive(InputObject)]
struct PreferencesInput {
    email_paused: Option<bool>,
    email_assignments: Option<bool>,
    email_comments: Option<bool>,
    email_progress: Option<bool>,
    tabs_enabled: Option<bool>,
    sidebar_layout: Option<Json<Value>>,
}

#[derive(InputObject)]
struct OpenTabInput {
    tab_type: String,
    target_id: String,
    title: String,
}

#[derive(InputObject)]
struct IssueStatusInput {
    name: String,
    color: Option<String>,
    category: String,
}

#[derive(InputObject)]
struct DeleteIssueStatusInput {
    replacement_status: Option<String>,
}

#[derive(InputObject)]
struct ReorderIssueStatusInput {
    id: String,
    sort_order: i32,
}

#[derive(InputObject)]
struct GrantChatAccessInput {
    user_id: String,
}

#[derive(InputObject)]
struct PostChatMessageInput {
    content: String,
    model: Option<String>,
}

#[derive(InputObject)]
struct SwitchOrganizationInput {
    organization_id: String,
}

#[derive(InputObject)]
struct CreateOrganizationInput {
    name: String,
}

#[derive(InputObject)]
struct UpdateActiveOrganizationInput {
    name: Option<String>,
    require_two_factor: Option<bool>,
}

#[derive(InputObject)]
struct DeleteActiveOrganizationInput {
    confirm: String,
}

#[Object]
impl MutationRoot {
    async fn switch_organization(
        &self,
        ctx: &Context<'_>,
        input: SwitchOrganizationInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = relaxed_auth(ctx)?;

        if !map_api(user_is_member(&state.db, &auth.user.id, &input.organization_id).await)? {
            return Err(graphql_error(ApiError::NotFound(
                "Organization not found".to_owned(),
            )));
        }

        let organization = organization::Entity::find_by_id(&input.organization_id)
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
            .ok_or_else(|| {
                graphql_error(ApiError::NotFound("Organization not found".to_owned()))
            })?;
        map_api(ensure_organization_not_suspended(&organization))?;
        if organization.require_two_factor && !auth.user.two_factor_enabled {
            return Err(graphql_error(ApiError::Forbidden(
                "Two-factor authentication is required for this workspace".to_owned(),
            )));
        }

        let (_, token) = map_api(
            set_session_active_organization(
                &state.db,
                state,
                auth.session.clone(),
                organization.id.clone(),
            )
            .await,
        )?;
        ctx.append_http_header(header::SET_COOKIE, map_api(auth_cookie(state, &token))?);
        to_json(crate::auth::AuthResponse {
            user: auth.user.clone().into(),
            organization: organization.into(),
        })
    }

    async fn create_organization(
        &self,
        ctx: &Context<'_>,
        input: CreateOrganizationInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = relaxed_auth(ctx)?;
        let organization =
            map_api(create_organization_for_user(&state.db, &auth.user, &input.name).await)?;
        let (_, token) = map_api(
            set_session_active_organization(
                &state.db,
                state,
                auth.session.clone(),
                organization.id.clone(),
            )
            .await,
        )?;
        ctx.append_http_header(header::SET_COOKIE, map_api(auth_cookie(state, &token))?);
        to_json(json!({ "organization": crate::auth::OrganizationResponse::from(organization) }))
    }

    async fn update_active_organization(
        &self,
        ctx: &Context<'_>,
        input: UpdateActiveOrganizationInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let headers = headers(ctx)?;
        let auth = auth(ctx)?;
        if input.name.is_some() {
            map_api(require_permission(state, auth, WORKSPACE_RENAME).await)?;
        }
        if input.require_two_factor.is_some() {
            map_api(require_permission(state, auth, WORKSPACE_SECURITY).await)?;
            map_api(ensure_fresh_two_factor(auth))?;
        }
        if input.require_two_factor == Some(true) && !auth.user.two_factor_enabled {
            return Err(graphql_error(ApiError::BadRequest(
                "Enable two-factor authentication on your account before requiring it for the workspace"
                    .to_owned(),
            )));
        }

        let mut active: organization::ActiveModel = auth.organization.clone().into();
        if let Some(name) = input.name.as_deref() {
            let name = name.trim();
            if name.is_empty() {
                return Err(graphql_error(ApiError::BadRequest(
                    "Workspace name is required".to_owned(),
                )));
            }
            if name.chars().count() > 64 {
                return Err(graphql_error(ApiError::BadRequest(
                    "Workspace name must be 64 characters or fewer".to_owned(),
                )));
            }
            active.name = Set(name.to_owned());
        }
        if let Some(require_two_factor) = input.require_two_factor {
            active.require_two_factor = Set(require_two_factor);
        }
        active.updated_at = Set(chrono::Utc::now().fixed_offset());
        let updated = active
            .update(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        if let Some(require_two_factor) = input.require_two_factor {
            map_api(
                record_security_event(
                    state,
                    Some(headers),
                    SecurityEventInput {
                        organization_id: Some(updated.id.clone()),
                        actor_user_id: Some(auth.user.id.clone()),
                        target_user_id: None,
                        event_type: if require_two_factor {
                            EVENT_WORKSPACE_REQUIRE_2FA_ENABLED
                        } else {
                            EVENT_WORKSPACE_REQUIRE_2FA_DISABLED
                        },
                        metadata: metadata_empty(),
                    },
                )
                .await,
            )?;
        }

        to_json(json!({ "organization": crate::auth::OrganizationResponse::from(updated) }))
    }

    async fn delete_active_organization(
        &self,
        ctx: &Context<'_>,
        input: DeleteActiveOrganizationInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let headers = headers(ctx)?;
        let auth = auth(ctx)?;
        map_api(require_permission(state, auth, WORKSPACE_DELETE).await)?;
        map_api(ensure_fresh_two_factor(auth))?;

        if input.confirm.trim() != auth.organization.name {
            return Err(graphql_error(ApiError::BadRequest(
                "Type the workspace name exactly to confirm deletion".to_owned(),
            )));
        }

        let other_membership = member::Entity::find()
            .filter(member::Column::UserId.eq(&auth.user.id))
            .filter(member::Column::OrganizationId.ne(&auth.organization.id))
            .order_by_asc(member::Column::CreatedAt)
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let next_organization = if let Some(other) = other_membership.as_ref() {
            organization::Entity::find_by_id(&other.organization_id)
                .one(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?
        } else {
            None
        };

        if next_organization.is_none() {
            return Err(graphql_error(ApiError::BadRequest(
                "You can't delete your only workspace. Create another one first.".to_owned(),
            )));
        }

        let deleted_org_id = auth.organization.id.clone();
        map_api(
            record_security_event(
                state,
                Some(headers),
                SecurityEventInput {
                    organization_id: Some(deleted_org_id.clone()),
                    actor_user_id: Some(auth.user.id.clone()),
                    target_user_id: None,
                    event_type: EVENT_WORKSPACE_DELETED,
                    metadata: json!({ "workspaceName": auth.organization.name }),
                },
            )
            .await,
        )?;
        organization::Entity::delete_by_id(&deleted_org_id)
            .exec(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let next_org = next_organization.expect("checked above");
        let (_, token) = map_api(
            set_session_active_organization(
                &state.db,
                state,
                auth.session.clone(),
                next_org.id.clone(),
            )
            .await,
        )?;
        ctx.append_http_header(header::SET_COOKIE, map_api(auth_cookie(state, &token))?);
        to_json(json!({
            "ok": true,
            "switchedTo": crate::auth::OrganizationResponse::from(next_org),
        }))
    }

    async fn leave_active_organization(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let membership = member::Entity::find()
            .filter(member::Column::UserId.eq(&auth.user.id))
            .filter(member::Column::OrganizationId.eq(&auth.organization.id))
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
            .ok_or_else(|| {
                graphql_error(ApiError::Forbidden(
                    "Not a member of this workspace".to_owned(),
                ))
            })?;

        if membership.role == ROLE_OWNER {
            return Err(graphql_error(ApiError::BadRequest(
                "Owners can't leave. Transfer ownership or delete the workspace.".to_owned(),
            )));
        }

        let other_membership = member::Entity::find()
            .filter(member::Column::UserId.eq(&auth.user.id))
            .filter(member::Column::OrganizationId.ne(&auth.organization.id))
            .order_by_asc(member::Column::CreatedAt)
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let next_organization = if let Some(other) = other_membership.as_ref() {
            organization::Entity::find_by_id(&other.organization_id)
                .one(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?
        } else {
            None
        };

        if next_organization.is_none() {
            return Err(graphql_error(ApiError::BadRequest(
                "You can't leave your only workspace.".to_owned(),
            )));
        }

        member::Entity::delete_by_id(&membership.id)
            .exec(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        let next_org = next_organization.expect("checked above");
        let (_, token) = map_api(
            set_session_active_organization(
                &state.db,
                state,
                auth.session.clone(),
                next_org.id.clone(),
            )
            .await,
        )?;
        ctx.append_http_header(header::SET_COOKIE, map_api(auth_cookie(state, &token))?);
        to_json(json!({
            "ok": true,
            "switchedTo": crate::auth::OrganizationResponse::from(next_org),
        }))
    }

    async fn revoke_account_session(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = relaxed_auth(ctx)?;
        if id == auth.session.id {
            return Err(graphql_error(ApiError::BadRequest(
                "Sign out to revoke the current session".to_owned(),
            )));
        }

        let row = session::Entity::find_by_id(&id)
            .filter(session::Column::UserId.eq(&auth.user.id))
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
            .ok_or_else(|| graphql_error(ApiError::NotFound("Session not found".to_owned())))?;

        if row.revoked_at.is_none() {
            let now = chrono::Utc::now().fixed_offset();
            let mut active = row.into_active_model();
            active.revoked_at = Set(Some(now));
            active.updated_at = Set(now);
            active
                .update(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?;
        }
        to_json(json!({ "ok": true }))
    }

    async fn revoke_other_account_sessions(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = relaxed_auth(ctx)?;
        let now = chrono::Utc::now().fixed_offset();
        let rows = session::Entity::find()
            .filter(session::Column::UserId.eq(&auth.user.id))
            .filter(session::Column::Id.ne(&auth.session.id))
            .filter(session::Column::RevokedAt.is_null())
            .filter(session::Column::ExpiresAt.gt(now))
            .all(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;

        for row in rows {
            let mut active = row.into_active_model();
            active.revoked_at = Set(Some(now));
            active.updated_at = Set(now);
            active
                .update(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?;
        }

        to_json(json!({ "ok": true }))
    }

    async fn create_issue(
        &self,
        ctx: &Context<'_>,
        input: CreateIssueInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let (_, AxumJson(envelope)) = map_api(
            crate::http::issues::create_issue(
                State(state),
                headers,
                AxumJson(crate::http::issues::CreateIssueRequest {
                    title: input.title,
                    description: input.description,
                    status: input.status,
                    priority: input.priority,
                    assigned_to_id: input.assigned_to_id,
                    parent_id: input.parent_id,
                    project_id: input.project_id,
                    label_ids: input.label_ids,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn update_issue(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: UpdateIssueInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            crate::http::issues::update_issue(
                State(state),
                headers,
                Path(id),
                AxumJson(crate::http::issues::UpdateIssueRequest {
                    title: input.title,
                    description: input.description,
                    status: input.status,
                    priority: input.priority,
                    assigned_to_id: input.assigned_to_id,
                    project_id: input.project_id,
                    label_ids: input.label_ids,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn delete_issue(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(ok) =
            map_api(crate::http::issues::delete_issue(State(state), headers, Path(id)).await)?;
        to_json(ok)
    }

    async fn create_issue_status(
        &self,
        ctx: &Context<'_>,
        input: IssueStatusInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let (_, AxumJson(envelope)) = map_api(
            issue_statuses::create_status(
                State(state),
                headers,
                AxumJson(issue_statuses::StatusRequest {
                    name: input.name,
                    color: input.color,
                    category: input.category,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn update_issue_status(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: IssueStatusInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            issue_statuses::update_status(
                State(state),
                headers,
                Path(id),
                AxumJson(issue_statuses::StatusRequest {
                    name: input.name,
                    color: input.color,
                    category: input.category,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn delete_issue_status(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: Option<DeleteIssueStatusInput>,
    ) -> async_graphql::Result<bool> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        map_api(
            issue_statuses::delete_status(
                State(state),
                headers,
                Path(id),
                AxumJson(issue_statuses::DeleteStatusRequest {
                    replacement_status: input.and_then(|input| input.replacement_status),
                }),
            )
            .await,
        )?;
        Ok(true)
    }

    async fn reorder_issue_statuses(
        &self,
        ctx: &Context<'_>,
        statuses: Vec<ReorderIssueStatusInput>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            issue_statuses::reorder_statuses(
                State(state),
                headers,
                AxumJson(issue_statuses::ReorderRequest {
                    statuses: statuses
                        .into_iter()
                        .map(|status| issue_statuses::ReorderItem {
                            id: status.id,
                            sort_order: status.sort_order,
                        })
                        .collect(),
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn create_project(
        &self,
        ctx: &Context<'_>,
        input: CreateProjectInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let (_, AxumJson(envelope)) = map_api(
            projects::create_project(
                State(state),
                headers,
                AxumJson(projects::CreateProjectRequest {
                    name: input.name,
                    description: input.description,
                    status: input.status,
                    color: input.color,
                    icon: input.icon,
                    lead_id: input.lead_id,
                    target_date: input.target_date,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn update_project(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: UpdateProjectInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            projects::patch_project(
                State(state),
                headers,
                Path(id),
                AxumJson(projects::PatchProjectRequest {
                    name: input.name,
                    description: input.description,
                    status: input.status,
                    color: input.color,
                    icon: input.icon,
                    lead_id: input.lead_id,
                    target_date: input.target_date,
                    archived: input.archived,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn delete_project(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<bool> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        map_api(projects::delete_project(State(state), headers, Path(id)).await)?;
        Ok(true)
    }

    async fn create_label(
        &self,
        ctx: &Context<'_>,
        input: CreateLabelInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let (_, AxumJson(envelope)) = map_api(
            labels::create_label(
                State(state),
                headers,
                AxumJson(labels::CreateLabelRequest {
                    name: input.name,
                    description: input.description,
                    color: input.color,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn update_label(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: UpdateLabelInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            labels::patch_label(
                State(state),
                headers,
                Path(id),
                AxumJson(labels::PatchLabelRequest {
                    name: input.name,
                    description: input.description,
                    color: input.color,
                    archived: input.archived,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn delete_label(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<bool> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        map_api(labels::delete_label(State(state), headers, Path(id)).await)?;
        Ok(true)
    }

    async fn update_preferences(
        &self,
        ctx: &Context<'_>,
        input: PreferencesInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let existing = map_api(preferences::for_user(state, &auth.user.id).await)?;
        let mut active = sea_orm::IntoActiveModel::into_active_model(existing);
        if let Some(value) = input.email_paused {
            active.email_paused = Set(value);
        }
        if let Some(value) = input.email_assignments {
            active.email_assignments = Set(value);
        }
        if let Some(value) = input.email_comments {
            active.email_comments = Set(value);
        }
        if let Some(value) = input.email_progress {
            active.email_progress = Set(value);
            if value {
                active.next_progress_email_at = Set(None);
            }
        }
        if let Some(value) = input.tabs_enabled {
            active.tabs_enabled = Set(value);
        }
        if let Some(value) = input.sidebar_layout {
            active.sidebar_layout = Set(Some(value.0));
        }
        active.updated_at = Set(chrono::Utc::now().fixed_offset());
        let updated = active
            .update(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        to_json(preferences::PreferencesResponse::from(updated))
    }

    async fn open_tab(
        &self,
        ctx: &Context<'_>,
        input: OpenTabInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let tab_type = input.tab_type.trim().to_owned();
        let target_id = input.target_id.trim().to_owned();
        let title = input.title.trim().to_owned();
        if tab_type.is_empty() || target_id.is_empty() || title.is_empty() {
            return Err(async_graphql::Error::new(
                "tabType, targetId, and title are required",
            ));
        }
        if !matches!(tab_type.as_str(), "issue" | "project" | "chat" | "page") {
            return Err(async_graphql::Error::new(
                "tabType must be one of issue, project, chat, page",
            ));
        }
        ensure_tab_target_accessible(state, auth, &tab_type, &target_id).await?;

        let now = chrono::Utc::now().fixed_offset();
        let on_conflict = OnConflict::columns([
            user_tab::Column::UserId,
            user_tab::Column::OrganizationId,
            user_tab::Column::TabType,
            user_tab::Column::TargetId,
        ])
        .update_columns([user_tab::Column::Title])
        .to_owned();

        user_tab::Entity::insert(user_tab::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            user_id: Set(auth.user.id.clone()),
            organization_id: Set(auth.organization.id.clone()),
            tab_type: Set(tab_type.clone()),
            target_id: Set(target_id.clone()),
            title: Set(title.clone()),
            opened_at: Set(now),
        })
        .on_conflict(on_conflict)
        .exec(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;

        let model = user_tab::Entity::find()
            .filter(user_tab::Column::UserId.eq(&auth.user.id))
            .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
            .filter(user_tab::Column::TabType.eq(&tab_type))
            .filter(user_tab::Column::TargetId.eq(&target_id))
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
            .ok_or_else(|| async_graphql::Error::new("tab vanished after upsert"))?;

        evict_overflow(state, &auth.user.id, &auth.organization.id).await?;
        to_json(crate::http::tabs::TabResponse::from(model))
    }

    async fn close_tab(&self, ctx: &Context<'_>, id: String) -> async_graphql::Result<bool> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        user_tab::Entity::delete_many()
            .filter(user_tab::Column::Id.eq(id))
            .filter(user_tab::Column::UserId.eq(&auth.user.id))
            .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
            .exec(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        Ok(true)
    }

    async fn close_all_tabs(&self, ctx: &Context<'_>) -> async_graphql::Result<bool> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        user_tab::Entity::delete_many()
            .filter(user_tab::Column::UserId.eq(&auth.user.id))
            .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
            .exec(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        Ok(true)
    }

    async fn mark_notification_read(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        if let Some(row) = notification::Entity::find_by_id(&id)
            .filter(notification::Column::OrganizationId.eq(&auth.organization.id))
            .filter(notification::Column::UserId.eq(&auth.user.id))
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
        {
            if row.read_at.is_none() {
                let mut active = sea_orm::IntoActiveModel::into_active_model(row);
                active.read_at = Set(Some(chrono::Utc::now().fixed_offset()));
                let updated = active
                    .update(&state.db)
                    .await
                    .map_err(ApiError::from)
                    .map_err(graphql_error)?;
                let response = map_api(inbox::notification_response(state, updated).await)?;
                state
                    .realtime
                    .publish_user_event_with_payload(
                        &state.db,
                        &auth.organization.id,
                        &auth.user.id,
                        RealtimeEntity::Notification,
                        RealtimeAction::Updated,
                        &response.id,
                        &response,
                    )
                    .await;
            }
        }
        QueryRoot.inbox(ctx).await
    }

    async fn mark_all_notifications_read(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        notification::Entity::update_many()
            .col_expr(
                notification::Column::ReadAt,
                sea_orm::sea_query::Expr::value(chrono::Utc::now().fixed_offset()),
            )
            .filter(notification::Column::OrganizationId.eq(&auth.organization.id))
            .filter(notification::Column::UserId.eq(&auth.user.id))
            .filter(notification::Column::ReadAt.is_null())
            .exec(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let payload = json!({ "sync": "inbox" });
        state
            .realtime
            .publish_user_event_with_payload(
                &state.db,
                &auth.organization.id,
                &auth.user.id,
                RealtimeEntity::Notification,
                RealtimeAction::Updated,
                "all",
                &payload,
            )
            .await;
        QueryRoot.inbox(ctx).await
    }

    async fn create_chat(&self, ctx: &Context<'_>) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let (_, AxumJson(envelope)) = map_api(chats::create_chat(State(state), headers).await)?;
        to_json(envelope)
    }

    async fn delete_chat(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(ok) = map_api(chats::delete_chat(State(state), headers, Path(id)).await)?;
        to_json(ok)
    }

    async fn grant_chat_access(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: GrantChatAccessInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            chats::grant_access(
                State(state),
                headers,
                Path(id),
                AxumJson(chats::GrantAccessRequest {
                    user_id: input.user_id,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn revoke_chat_access(
        &self,
        ctx: &Context<'_>,
        id: String,
        user_id: String,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(ok) =
            map_api(chats::revoke_access(State(state), headers, Path((id, user_id))).await)?;
        to_json(ok)
    }

    async fn post_chat_message(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: PostChatMessageInput,
    ) -> async_graphql::Result<Json<Value>> {
        let state = state(ctx)?.clone();
        let headers = headers(ctx)?.clone();
        let AxumJson(envelope) = map_api(
            chats::post_message(
                State(state),
                headers,
                Path(id),
                AxumJson(chats::PostMessageRequest {
                    content: input.content,
                    model: input.model,
                }),
            )
            .await,
        )?;
        to_json(envelope)
    }

    async fn internal_json(
        &self,
        ctx: &Context<'_>,
        method: String,
        path: String,
        body: Option<Json<Value>>,
    ) -> async_graphql::Result<Json<Value>> {
        bridge_budget(ctx)?.take()?;
        let method = match method.trim().to_ascii_uppercase().as_str() {
            "POST" => Method::POST,
            "PATCH" => Method::PATCH,
            "PUT" => Method::PUT,
            "DELETE" => Method::DELETE,
            _ => return Err(async_graphql::Error::new("Unsupported internal API method")),
        };
        execute_internal_api_request(
            state(ctx)?,
            headers(ctx)?,
            method,
            &path,
            body.map(|value| value.0),
        )
        .await
    }
}

async fn evict_overflow(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> async_graphql::Result<()> {
    const MAX_TABS_PER_ORG: usize = 50;

    let count = user_tab::Entity::find()
        .filter(user_tab::Column::UserId.eq(user_id))
        .filter(user_tab::Column::OrganizationId.eq(organization_id))
        .count(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;
    if (count as usize) <= MAX_TABS_PER_ORG {
        return Ok(());
    }
    let overflow = (count as usize) - MAX_TABS_PER_ORG;
    let oldest = user_tab::Entity::find()
        .filter(user_tab::Column::UserId.eq(user_id))
        .filter(user_tab::Column::OrganizationId.eq(organization_id))
        .order_by_asc(user_tab::Column::OpenedAt)
        .limit(overflow as u64)
        .all(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;
    if oldest.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = oldest.into_iter().map(|tab| tab.id).collect();
    user_tab::Entity::delete_many()
        .filter(
            Condition::all()
                .add(user_tab::Column::UserId.eq(user_id))
                .add(user_tab::Column::OrganizationId.eq(organization_id))
                .add(user_tab::Column::Id.is_in(ids)),
        )
        .exec(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;
    Ok(())
}

async fn accessible_chat_ids(
    state: &AppState,
    auth: &AuthContext,
) -> async_graphql::Result<Vec<String>> {
    let rows = chat_access::Entity::find()
        .filter(chat_access::Column::UserId.eq(&auth.user.id))
        .all(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;

    Ok(rows.into_iter().map(|row| row.chat_id).collect())
}

async fn ensure_tab_target_accessible(
    state: &AppState,
    auth: &AuthContext,
    tab_type: &str,
    target_id: &str,
) -> async_graphql::Result<()> {
    let exists = match tab_type {
        "issue" => issue::Entity::find()
            .filter(issue::Column::Id.eq(target_id))
            .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
            .is_some(),
        "project" => project::Entity::find()
            .filter(project::Column::Id.eq(target_id))
            .filter(project::Column::OrganizationId.eq(&auth.organization.id))
            .one(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?
            .is_some(),
        "chat" => {
            let has_access = chat_access::Entity::find()
                .filter(chat_access::Column::ChatId.eq(target_id))
                .filter(chat_access::Column::UserId.eq(&auth.user.id))
                .one(&state.db)
                .await
                .map_err(ApiError::from)
                .map_err(graphql_error)?
                .is_some();
            if !has_access {
                false
            } else {
                chat::Entity::find()
                    .filter(chat::Column::Id.eq(target_id))
                    .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
                    .one(&state.db)
                    .await
                    .map_err(ApiError::from)
                    .map_err(graphql_error)?
                    .is_some()
            }
        }
        "page" => true,
        _ => false,
    };

    if exists {
        Ok(())
    } else {
        Err(graphql_error(ApiError::NotFound(
            "Tab target not found".to_owned(),
        )))
    }
}
