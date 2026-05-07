use crate::{
    auth::{require_auth, AuthContext},
    error::ApiError,
    http::{inbox, issue_statuses, labels, preferences, projects},
    realtime::{RealtimeAction, RealtimeEntity},
    state::AppState,
};
use async_graphql::{Context, EmptySubscription, InputObject, Json, Object, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::post,
    Json as AxumJson, Router,
};
use produktive_entity::{
    chat, chat_access, issue, label, member, notification, project, session, user, user_tab,
};
use sea_orm::{
    sea_query::OnConflict, ActiveModelTrait, ColumnTrait, Condition, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub type AppSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

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
        .data(headers.clone());
    match require_auth(&headers, &state).await {
        Ok(auth) => {
            request = request.data(auth);
            schema(state.config.is_production_like())
                .execute(request)
                .await
                .into()
        }
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

pub struct QueryRoot;

#[Object]
impl QueryRoot {
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

#[Object]
impl MutationRoot {
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
