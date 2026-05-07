use crate::{
    auth::{require_api_key, ApiKeyContext},
    error::ApiError,
    http::issue_statuses::{
        self, validate_issue_status, CATEGORY_ACTIVE, CATEGORY_BACKLOG, CATEGORY_CANCELED,
        CATEGORY_DONE,
    },
    issue_helpers::{non_empty_optional, normalize_assignee, required_string, validate_assignee},
    issue_history::{record_issue_event, string_change, IssueChange},
    realtime::{RealtimeAction, RealtimeEntity},
    state::AppState,
};
use async_graphql::{
    http::GraphiQLSource, Context, EmptySubscription, InputObject, Json, Object, Schema,
    SimpleObject, ID,
};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{extract::State, http::HeaderMap, response::Html, routing::get, Router};
use chrono::{DateTime, FixedOffset, Utc};
use produktive_entity::{issue, issue_label, label, member, organization, project, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub type PublicSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

pub fn routes() -> Router<AppState> {
    Router::new().route("/graphql", get(graphiql_handler).post(graphql_handler))
}

fn schema() -> PublicSchema {
    Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .limit_depth(10)
        .limit_complexity(256)
        .finish()
}

async fn graphiql_handler() -> Html<String> {
    let source = GraphiQLSource::build()
        .endpoint("/api/v1/graphql")
        .title("Produktive Public GraphQL API")
        .finish();
    let default_headers =
        serde_json::to_string_pretty(&json!({ "Authorization": "Bearer <api_key>" }))
            .unwrap_or_default();
    Html(source.replace(
        "defaultEditorToolsVisibility: true,",
        &format!(
            "defaultEditorToolsVisibility: true,\n          defaultHeaders: {default_headers},"
        ),
    ))
}

async fn graphql_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: GraphQLRequest,
) -> GraphQLResponse {
    let mut request = request.into_inner().data(state.clone());
    match require_api_key(&headers, &state).await {
        Ok(auth) => {
            request = request.data(auth);
            schema().execute(request).await.into()
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

fn auth<'ctx>(ctx: &'ctx Context<'ctx>) -> async_graphql::Result<&'ctx ApiKeyContext> {
    ctx.data::<ApiKeyContext>()
}

fn graphql_error(error: ApiError) -> async_graphql::Error {
    async_graphql::Error::new(error.to_string())
}

fn map_api<T>(result: Result<T, ApiError>) -> async_graphql::Result<T> {
    result.map_err(graphql_error)
}

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn viewer(&self, ctx: &Context<'_>) -> async_graphql::Result<ApiViewer> {
        let auth = auth(ctx)?;
        Ok(ApiViewer {
            user: ApiUser::from(auth.user.clone()),
            workspace: ApiWorkspace::from(auth.organization.clone()),
        })
    }

    async fn issues(
        &self,
        ctx: &Context<'_>,
        filter: Option<IssueFilterInput>,
        #[graphql(default = 50)] limit: i32,
    ) -> async_graphql::Result<Vec<Issue>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        map_api(
            list_issues_for_api_key(
                state,
                &auth.organization.id,
                filter.unwrap_or_default(),
                limit,
            )
            .await,
        )
    }

    async fn issue(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Issue>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let Some(row) =
            map_api(find_issue_optional(state, &auth.organization.id, id.as_str()).await)?
        else {
            return Ok(None);
        };
        map_api(issue_response(state, row).await).map(Some)
    }

    async fn labels(
        &self,
        ctx: &Context<'_>,
        #[graphql(default = false)] include_archived: bool,
    ) -> async_graphql::Result<Vec<Label>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        map_api(list_labels_for_api_key(state, &auth.organization.id, include_archived).await)
    }

    async fn label(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Label>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let Some(row) =
            map_api(find_label_optional(state, &auth.organization.id, id.as_str()).await)?
        else {
            return Ok(None);
        };
        map_api(label_response(state, row).await).map(Some)
    }

    async fn projects(
        &self,
        ctx: &Context<'_>,
        #[graphql(default = false)] include_archived: bool,
    ) -> async_graphql::Result<Vec<Project>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        map_api(list_projects_for_api_key(state, &auth.organization.id, include_archived).await)
    }

    async fn project(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Project>> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let Some(row) =
            map_api(find_project_optional(state, &auth.organization.id, id.as_str()).await)?
        else {
            return Ok(None);
        };
        map_api(project_response(state, row).await).map(Some)
    }
}

pub struct MutationRoot;

#[Object]
impl MutationRoot {
    async fn create_issue(
        &self,
        ctx: &Context<'_>,
        input: CreateIssueInput,
    ) -> async_graphql::Result<IssuePayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let organization_id = auth.organization.id.clone();
        let actor_id = auth.user.id.clone();
        let assigned_to_id = normalize_assignee(input.assigned_to_id)?;
        validate_assignee(state, &organization_id, assigned_to_id.as_deref())
            .await
            .map_err(graphql_error)?;

        let parent_id = normalize_optional_string(input.parent_id);
        if let Some(parent_id) = parent_id.as_deref() {
            find_issue(state, &organization_id, parent_id)
                .await
                .map_err(graphql_error)?;
        }

        let project_id = normalize_optional_string(input.project_id);
        if let Some(project_id) = project_id.as_deref() {
            crate::http::projects::find_project(state, &organization_id, project_id)
                .await
                .map_err(graphql_error)?;
        }

        let label_ids = normalize_ids(input.label_ids.unwrap_or_default());
        crate::http::labels::validate_labels(state, &organization_id, &label_ids)
            .await
            .map_err(graphql_error)?;

        let status = validate_issue_status(
            state,
            &organization_id,
            &non_empty(input.status).unwrap_or_else(|| "backlog".to_owned()),
        )
        .await
        .map_err(graphql_error)?;
        let now = Utc::now().fixed_offset();
        let row = issue::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            organization_id: Set(organization_id.clone()),
            title: Set(required_string(input.title, "Title")?),
            description: Set(non_empty_optional(input.description.unwrap_or_default())?),
            status: Set(status),
            priority: Set(non_empty(input.priority).unwrap_or_else(|| "medium".to_owned())),
            created_by_id: Set(Some(actor_id.clone())),
            assigned_to_id: Set(assigned_to_id.clone()),
            parent_id: Set(parent_id),
            project_id: Set(project_id),
            attachments: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;
        crate::http::labels::replace_issue_labels(state, &row.id, &label_ids)
            .await
            .map_err(graphql_error)?;

        record_issue_event(
            state,
            &organization_id,
            &row.id,
            Some(&actor_id),
            "created",
            vec![
                IssueChange {
                    field: "title".to_owned(),
                    before: Value::Null,
                    after: json!(row.title),
                },
                IssueChange {
                    field: "status".to_owned(),
                    before: Value::Null,
                    after: json!(row.status),
                },
                IssueChange {
                    field: "priority".to_owned(),
                    before: Value::Null,
                    after: json!(row.priority),
                },
                IssueChange {
                    field: "assignedToId".to_owned(),
                    before: Value::Null,
                    after: assigned_to_id.map(Value::String).unwrap_or(Value::Null),
                },
                IssueChange {
                    field: "labelIds".to_owned(),
                    before: Value::Null,
                    after: json!(label_ids),
                },
            ],
        )
        .await
        .map_err(graphql_error)?;
        let response = issue_response(state, row).await.map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event_with_payload(
                &state.db,
                &organization_id,
                RealtimeEntity::Issue,
                RealtimeAction::Created,
                response.id.as_str(),
                &response,
            )
            .await;

        Ok(IssuePayload { issue: response })
    }

    async fn update_issue(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateIssueInput,
    ) -> async_graphql::Result<IssuePayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let organization_id = auth.organization.id.clone();
        let before = find_issue(state, &organization_id, id.as_str())
            .await
            .map_err(graphql_error)?;
        let mut active = before.clone().into_active_model();
        let mut changes = Vec::new();

        if let Some(title) = input.title {
            let next = required_string(title, "Title")?;
            if let Some(change) = string_change("title", Some(&before.title), Some(&next)) {
                changes.push(change);
            }
            active.title = Set(next);
        }
        if let Some(description) = input.description {
            let next = non_empty_optional(description)?;
            if let Some(change) = string_change(
                "description",
                before.description.as_deref(),
                next.as_deref(),
            ) {
                changes.push(change);
            }
            active.description = Set(next);
        }
        if let Some(status) = input.status {
            let next =
                validate_issue_status(state, &organization_id, &required_string(status, "Status")?)
                    .await
                    .map_err(graphql_error)?;
            if let Some(change) = string_change("status", Some(&before.status), Some(&next)) {
                changes.push(change);
            }
            active.status = Set(next);
        }
        if let Some(priority) = input.priority {
            let next = required_string(priority, "Priority")?;
            if let Some(change) = string_change("priority", Some(&before.priority), Some(&next)) {
                changes.push(change);
            }
            active.priority = Set(next);
        }
        if let Some(raw_assignee) = input.assigned_to_id {
            let next = normalize_assignee(Some(raw_assignee))?;
            validate_assignee(state, &organization_id, next.as_deref())
                .await
                .map_err(graphql_error)?;
            if let Some(change) = string_change(
                "assignedToId",
                before.assigned_to_id.as_deref(),
                next.as_deref(),
            ) {
                changes.push(change);
            }
            active.assigned_to_id = Set(next);
        }
        if let Some(raw_parent) = input.parent_id {
            let next = normalize_optional_string(Some(raw_parent));
            if let Some(parent_id) = next.as_deref() {
                find_issue(state, &organization_id, parent_id)
                    .await
                    .map_err(graphql_error)?;
            }
            if let Some(change) =
                string_change("parentId", before.parent_id.as_deref(), next.as_deref())
            {
                changes.push(change);
            }
            active.parent_id = Set(next);
        }
        if let Some(raw_project) = input.project_id {
            let next = normalize_optional_string(Some(raw_project));
            if let Some(project_id) = next.as_deref() {
                crate::http::projects::find_project(state, &organization_id, project_id)
                    .await
                    .map_err(graphql_error)?;
            }
            if let Some(change) =
                string_change("projectId", before.project_id.as_deref(), next.as_deref())
            {
                changes.push(change);
            }
            active.project_id = Set(next);
        }
        if let Some(label_ids) = input.label_ids {
            let label_ids = normalize_ids(label_ids);
            crate::http::labels::validate_labels(state, &organization_id, &label_ids)
                .await
                .map_err(graphql_error)?;
            let before_label_ids = crate::http::labels::labels_for_issue(state, &before.id)
                .await
                .map_err(graphql_error)?
                .into_iter()
                .map(|label| label.id)
                .collect::<Vec<_>>();
            if before_label_ids != label_ids {
                changes.push(IssueChange {
                    field: "labelIds".to_owned(),
                    before: json!(before_label_ids),
                    after: json!(label_ids),
                });
                crate::http::labels::replace_issue_labels(state, &before.id, &label_ids)
                    .await
                    .map_err(graphql_error)?;
            }
        }

        active.updated_at = Set(Utc::now().fixed_offset());
        let updated = active
            .update(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        if !changes.is_empty() {
            record_issue_event(
                state,
                &organization_id,
                &updated.id,
                Some(&auth.user.id),
                "updated",
                changes,
            )
            .await
            .map_err(graphql_error)?;
        }
        let response = issue_response(state, updated)
            .await
            .map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event_with_payload(
                &state.db,
                &organization_id,
                RealtimeEntity::Issue,
                RealtimeAction::Updated,
                response.id.as_str(),
                &response,
            )
            .await;

        Ok(IssuePayload { issue: response })
    }

    async fn delete_issue(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<DeletePayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let row = find_issue(state, &auth.organization.id, id.as_str())
            .await
            .map_err(graphql_error)?;
        row.delete(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event(
                &state.db,
                &auth.organization.id,
                RealtimeEntity::Issue,
                RealtimeAction::Deleted,
                id.as_str(),
            )
            .await;
        Ok(DeletePayload { ok: true })
    }

    async fn create_label(
        &self,
        ctx: &Context<'_>,
        input: CreateLabelInput,
    ) -> async_graphql::Result<LabelPayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let organization_id = auth.organization.id.clone();
        let name = required_string(input.name, "Label name")?;
        if name.chars().count() > 48 {
            return Err(graphql_error(ApiError::BadRequest(
                "Label name must be 48 characters or fewer".to_owned(),
            )));
        }
        ensure_unique_label_name(state, &organization_id, &name, None)
            .await
            .map_err(graphql_error)?;

        let now = Utc::now().fixed_offset();
        let row = label::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            organization_id: Set(organization_id.clone()),
            name: Set(name),
            description: Set(non_empty(input.description)),
            color: Set(normalize_color(input.color.as_deref(), "gray")),
            created_by_id: Set(Some(auth.user.id.clone())),
            archived_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;
        let response = label_response(state, row).await.map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event_with_payload(
                &state.db,
                &organization_id,
                RealtimeEntity::Label,
                RealtimeAction::Created,
                response.id.as_str(),
                &response,
            )
            .await;

        Ok(LabelPayload { label: response })
    }

    async fn update_label(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateLabelInput,
    ) -> async_graphql::Result<LabelPayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let organization_id = auth.organization.id.clone();
        let existing = find_label(state, &organization_id, id.as_str())
            .await
            .map_err(graphql_error)?;
        let existing_id = existing.id.clone();
        let mut active = existing.into_active_model();

        if let Some(name) = input.name {
            let name = required_string(name, "Label name")?;
            if name.chars().count() > 48 {
                return Err(graphql_error(ApiError::BadRequest(
                    "Label name must be 48 characters or fewer".to_owned(),
                )));
            }
            ensure_unique_label_name(state, &organization_id, &name, Some(&existing_id))
                .await
                .map_err(graphql_error)?;
            active.name = Set(name);
        }
        if let Some(description) = input.description {
            active.description = Set(non_empty(Some(description)));
        }
        if let Some(color) = input.color {
            active.color = Set(normalize_color(Some(&color), "gray"));
        }
        if let Some(archived) = input.archived {
            active.archived_at = Set(archived.then(|| Utc::now().fixed_offset()));
        }
        active.updated_at = Set(Utc::now().fixed_offset());

        let row = active
            .update(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let response = label_response(state, row).await.map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event_with_payload(
                &state.db,
                &organization_id,
                RealtimeEntity::Label,
                RealtimeAction::Updated,
                response.id.as_str(),
                &response,
            )
            .await;
        Ok(LabelPayload { label: response })
    }

    async fn delete_label(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<DeletePayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let row = find_label(state, &auth.organization.id, id.as_str())
            .await
            .map_err(graphql_error)?;
        row.delete(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event(
                &state.db,
                &auth.organization.id,
                RealtimeEntity::Label,
                RealtimeAction::Deleted,
                id.as_str(),
            )
            .await;
        Ok(DeletePayload { ok: true })
    }

    async fn create_project(
        &self,
        ctx: &Context<'_>,
        input: CreateProjectInput,
    ) -> async_graphql::Result<ProjectPayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let organization_id = auth.organization.id.clone();
        let lead_id = normalize_optional_string(input.lead_id);
        if let Some(lead_id) = lead_id.as_deref() {
            validate_member(state, &organization_id, lead_id)
                .await
                .map_err(graphql_error)?;
        }
        let target_date = parse_optional_date(input.target_date.as_deref())?;
        let next_order = next_project_order(state, &organization_id)
            .await
            .map_err(graphql_error)?;
        let now = Utc::now().fixed_offset();
        let row = project::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            organization_id: Set(organization_id.clone()),
            name: Set(required_string(input.name, "Project name")?),
            description: Set(non_empty(input.description)),
            status: Set(normalize_project_status(input.status.as_deref())),
            color: Set(normalize_color(input.color.as_deref(), "blue")),
            icon: Set(normalize_optional_string(input.icon)),
            lead_id: Set(lead_id),
            target_date: Set(target_date),
            sort_order: Set(next_order),
            created_by_id: Set(Some(auth.user.id.clone())),
            archived_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&state.db)
        .await
        .map_err(ApiError::from)
        .map_err(graphql_error)?;
        let response = project_response(state, row).await.map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event_with_payload(
                &state.db,
                &organization_id,
                RealtimeEntity::Project,
                RealtimeAction::Created,
                response.id.as_str(),
                &response,
            )
            .await;

        Ok(ProjectPayload { project: response })
    }

    async fn update_project(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateProjectInput,
    ) -> async_graphql::Result<ProjectPayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let organization_id = auth.organization.id.clone();
        let existing = find_project(state, &organization_id, id.as_str())
            .await
            .map_err(graphql_error)?;
        let mut active = existing.into_active_model();

        if let Some(name) = input.name {
            active.name = Set(required_string(name, "Project name")?);
        }
        if let Some(description) = input.description {
            active.description = Set(non_empty(Some(description)));
        }
        if let Some(status) = input.status {
            active.status = Set(normalize_project_status(Some(&status)));
        }
        if let Some(color) = input.color {
            active.color = Set(normalize_color(Some(&color), "blue"));
        }
        if let Some(icon) = input.icon {
            active.icon = Set(normalize_optional_string(Some(icon)));
        }
        if let Some(lead_id) = input.lead_id {
            let lead_id = normalize_optional_string(Some(lead_id));
            if let Some(lead_id) = lead_id.as_deref() {
                validate_member(state, &organization_id, lead_id)
                    .await
                    .map_err(graphql_error)?;
            }
            active.lead_id = Set(lead_id);
        }
        if let Some(target_date) = input.target_date {
            active.target_date = Set(parse_optional_date(Some(&target_date))?);
        }
        if let Some(archived) = input.archived {
            active.archived_at = Set(archived.then(|| Utc::now().fixed_offset()));
        }
        active.updated_at = Set(Utc::now().fixed_offset());

        let row = active
            .update(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        let response = project_response(state, row).await.map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event_with_payload(
                &state.db,
                &organization_id,
                RealtimeEntity::Project,
                RealtimeAction::Updated,
                response.id.as_str(),
                &response,
            )
            .await;
        Ok(ProjectPayload { project: response })
    }

    async fn delete_project(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<DeletePayload> {
        let state = state(ctx)?;
        let auth = auth(ctx)?;
        let row = find_project(state, &auth.organization.id, id.as_str())
            .await
            .map_err(graphql_error)?;
        row.delete(&state.db)
            .await
            .map_err(ApiError::from)
            .map_err(graphql_error)?;
        state
            .realtime
            .publish_workspace_event(
                &state.db,
                &auth.organization.id,
                RealtimeEntity::Project,
                RealtimeAction::Deleted,
                id.as_str(),
            )
            .await;
        Ok(DeletePayload { ok: true })
    }
}

#[derive(InputObject, Default)]
struct IssueFilterInput {
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    project_id: Option<String>,
    label_id: Option<String>,
    label_ids: Option<Vec<String>>,
}

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
    parent_id: Option<String>,
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
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

#[derive(SimpleObject)]
struct ApiViewer {
    user: ApiUser,
    workspace: ApiWorkspace,
}

#[derive(SimpleObject, Serialize)]
struct ApiUser {
    id: ID,
    name: String,
    email: String,
    image: Option<String>,
}

impl From<user::Model> for ApiUser {
    fn from(user: user::Model) -> Self {
        Self {
            id: ID::from(user.id),
            name: user.name,
            email: user.email,
            image: user.image,
        }
    }
}

#[derive(SimpleObject)]
struct ApiWorkspace {
    id: ID,
    name: String,
    slug: String,
    image: Option<String>,
}

impl From<organization::Model> for ApiWorkspace {
    fn from(organization: organization::Model) -> Self {
        Self {
            id: ID::from(organization.id),
            name: organization.name,
            slug: organization.slug,
            image: organization.image,
        }
    }
}

#[derive(SimpleObject)]
struct IssuePayload {
    issue: Issue,
}

#[derive(SimpleObject)]
struct LabelPayload {
    label: Label,
}

#[derive(SimpleObject)]
struct ProjectPayload {
    project: Project,
}

#[derive(SimpleObject)]
struct DeletePayload {
    ok: bool,
}

#[derive(SimpleObject, Serialize)]
struct Issue {
    id: ID,
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
    created_at: DateTime<FixedOffset>,
    updated_at: DateTime<FixedOffset>,
    created_by: Option<ApiUser>,
    assigned_to: Option<ApiUser>,
    parent_id: Option<String>,
    project_id: Option<String>,
    project: Option<ProjectSummary>,
    labels: Vec<LabelSummary>,
    attachments: Vec<Json<Value>>,
}

#[derive(SimpleObject, Serialize)]
struct ProjectSummary {
    id: ID,
    name: String,
    color: String,
    icon: Option<String>,
}

#[derive(SimpleObject, Serialize)]
struct LabelSummary {
    id: ID,
    name: String,
    color: String,
}

#[derive(SimpleObject, Serialize)]
struct Label {
    id: ID,
    name: String,
    description: Option<String>,
    color: String,
    archived_at: Option<DateTime<FixedOffset>>,
    created_at: DateTime<FixedOffset>,
    updated_at: DateTime<FixedOffset>,
    issue_count: u64,
}

#[derive(SimpleObject, Serialize)]
struct Project {
    id: ID,
    name: String,
    description: Option<String>,
    status: String,
    color: String,
    icon: Option<String>,
    lead_id: Option<String>,
    lead: Option<ApiUser>,
    target_date: Option<DateTime<FixedOffset>>,
    sort_order: i32,
    archived_at: Option<DateTime<FixedOffset>>,
    created_at: DateTime<FixedOffset>,
    updated_at: DateTime<FixedOffset>,
    issue_count: u64,
    done_count: u64,
    status_breakdown: StatusBreakdown,
}

#[derive(Default, SimpleObject, Serialize)]
struct StatusBreakdown {
    backlog: u64,
    todo: u64,
    in_progress: u64,
    done: u64,
}

async fn list_issues_for_api_key(
    state: &AppState,
    organization_id: &str,
    filter: IssueFilterInput,
    limit: i32,
) -> Result<Vec<Issue>, ApiError> {
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(limit.clamp(1, 100) as u64);

    if let Some(status) = non_empty(filter.status) {
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = non_empty(filter.priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    if let Some(assigned_to_id) = non_empty(filter.assigned_to_id) {
        select = select.filter(issue::Column::AssignedToId.eq(assigned_to_id));
    }
    if let Some(project_id) = non_empty(filter.project_id) {
        select = select.filter(issue::Column::ProjectId.eq(project_id));
    }

    let mut label_ids = filter.label_ids.unwrap_or_default();
    if let Some(label_id) = filter.label_id {
        label_ids.push(label_id);
    }
    let label_ids = normalize_ids(label_ids);
    if !label_ids.is_empty() {
        crate::http::labels::validate_labels(state, organization_id, &label_ids).await?;
        let joins = issue_label::Entity::find()
            .filter(issue_label::Column::LabelId.is_in(label_ids))
            .all(&state.db)
            .await?;
        let issue_ids = normalize_ids(joins.into_iter().map(|join| join.issue_id).collect());
        if issue_ids.is_empty() {
            return Ok(Vec::new());
        }
        select = select.filter(issue::Column::Id.is_in(issue_ids));
    }

    let rows = select.all(&state.db).await?;
    let mut issues = Vec::with_capacity(rows.len());
    for row in rows {
        issues.push(issue_response(state, row).await?);
    }
    Ok(issues)
}

async fn list_labels_for_api_key(
    state: &AppState,
    organization_id: &str,
    include_archived: bool,
) -> Result<Vec<Label>, ApiError> {
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .order_by_asc(label::Column::Name);
    if !include_archived {
        select = select.filter(label::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await?;
    let mut labels = Vec::with_capacity(rows.len());
    for row in rows {
        labels.push(label_response(state, row).await?);
    }
    Ok(labels)
}

async fn list_projects_for_api_key(
    state: &AppState,
    organization_id: &str,
    include_archived: bool,
) -> Result<Vec<Project>, ApiError> {
    let mut select = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .order_by_asc(project::Column::ArchivedAt)
        .order_by_asc(project::Column::SortOrder)
        .order_by_desc(project::Column::CreatedAt);
    if !include_archived {
        select = select.filter(project::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await?;
    let mut projects = Vec::with_capacity(rows.len());
    for row in rows {
        projects.push(project_response(state, row).await?);
    }
    Ok(projects)
}

async fn find_issue(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<issue::Model, ApiError> {
    find_issue_optional(state, organization_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))
}

async fn find_issue_optional(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<Option<issue::Model>, ApiError> {
    Ok(issue::Entity::find_by_id(id)
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?)
}

async fn find_label(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<label::Model, ApiError> {
    find_label_optional(state, organization_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Label not found".to_owned()))
}

async fn find_label_optional(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<Option<label::Model>, ApiError> {
    Ok(label::Entity::find_by_id(id)
        .filter(label::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?)
}

async fn find_project(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<project::Model, ApiError> {
    find_project_optional(state, organization_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".to_owned()))
}

async fn find_project_optional(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<Option<project::Model>, ApiError> {
    Ok(project::Entity::find_by_id(id)
        .filter(project::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?)
}

async fn issue_response(state: &AppState, row: issue::Model) -> Result<Issue, ApiError> {
    let created_by = match &row.created_by_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let assigned_to = match &row.assigned_to_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let project = match &row.project_id {
        Some(id) => project::Entity::find_by_id(id)
            .filter(project::Column::OrganizationId.eq(&row.organization_id))
            .one(&state.db)
            .await?
            .map(|project| ProjectSummary {
                id: ID::from(project.id),
                name: project.name,
                color: project.color,
                icon: project.icon,
            }),
        None => None,
    };
    let labels = crate::http::labels::labels_for_issue(state, &row.id)
        .await?
        .into_iter()
        .filter(|label| label.organization_id == row.organization_id)
        .map(|label| LabelSummary {
            id: ID::from(label.id),
            name: label.name,
            color: label.color,
        })
        .collect();

    Ok(Issue {
        id: ID::from(row.id),
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by,
        assigned_to,
        parent_id: row.parent_id,
        project_id: row.project_id,
        project,
        labels,
        attachments: row
            .attachments
            .and_then(|value| serde_json::from_value::<Vec<Value>>(value).ok())
            .unwrap_or_default()
            .into_iter()
            .map(Json)
            .collect(),
    })
}

async fn label_response(state: &AppState, row: label::Model) -> Result<Label, ApiError> {
    let issue_count = issue_label::Entity::find()
        .filter(issue_label::Column::LabelId.eq(&row.id))
        .count(&state.db)
        .await?;
    Ok(Label {
        id: ID::from(row.id),
        name: row.name,
        description: row.description,
        color: row.color,
        archived_at: row.archived_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        issue_count,
    })
}

async fn project_response(state: &AppState, row: project::Model) -> Result<Project, ApiError> {
    let lead = match &row.lead_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let issue_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .count(&state.db)
        .await?;
    let statuses = issue_statuses::list_issue_statuses(state, &row.organization_id, false).await?;
    let mut status_breakdown = StatusBreakdown::default();
    let mut done_count = 0_u64;
    let project_issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .all(&state.db)
        .await?;
    for issue in project_issues {
        let category = statuses
            .iter()
            .find(|status| status.key == issue.status)
            .map(|status| status.category.as_str())
            .unwrap_or(CATEGORY_ACTIVE);
        match category {
            CATEGORY_BACKLOG => status_breakdown.backlog += 1,
            CATEGORY_ACTIVE => status_breakdown.todo += 1,
            CATEGORY_DONE => {
                status_breakdown.done += 1;
                done_count += 1;
            }
            CATEGORY_CANCELED => {}
            _ => {}
        }
    }

    Ok(Project {
        id: ID::from(row.id),
        name: row.name,
        description: row.description,
        status: row.status,
        color: row.color,
        icon: row.icon,
        lead_id: row.lead_id,
        lead,
        target_date: row.target_date,
        sort_order: row.sort_order,
        archived_at: row.archived_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        issue_count,
        done_count,
        status_breakdown,
    })
}

async fn find_user_response(state: &AppState, id: &str) -> Result<Option<ApiUser>, ApiError> {
    Ok(user::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .map(ApiUser::from))
}

async fn validate_member(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
) -> Result<(), ApiError> {
    let exists = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .filter(member::Column::UserId.eq(user_id))
        .one(&state.db)
        .await?
        .is_some();
    if exists {
        return Ok(());
    }
    Err(ApiError::BadRequest(
        "User must be a member of this workspace".to_owned(),
    ))
}

async fn ensure_unique_label_name(
    state: &AppState,
    organization_id: &str,
    name: &str,
    exclude_id: Option<&str>,
) -> Result<(), ApiError> {
    let lowered = name.to_lowercase();
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::ArchivedAt.is_null());
    if let Some(id) = exclude_id {
        select = select.filter(label::Column::Id.ne(id));
    }
    let rows = select.all(&state.db).await?;
    if rows.iter().any(|row| row.name.to_lowercase() == lowered) {
        return Err(ApiError::Conflict(
            "A label with this name already exists".to_owned(),
        ));
    }
    Ok(())
}

async fn next_project_order(state: &AppState, organization_id: &str) -> Result<i32, ApiError> {
    Ok(project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .select_only()
        .column_as(project::Column::SortOrder.max(), "max_order")
        .into_tuple::<Option<i32>>()
        .one(&state.db)
        .await?
        .flatten()
        .unwrap_or(0)
        + 1)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    non_empty(value)
}

fn normalize_ids(values: Vec<String>) -> Vec<String> {
    let mut ids = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if !trimmed.is_empty() && !ids.iter().any(|id: &String| id == trimmed) {
            ids.push(trimmed.to_owned());
        }
    }
    ids
}

fn normalize_color(value: Option<&str>, default: &str) -> String {
    let allowed = [
        "blue", "green", "orange", "purple", "pink", "red", "yellow", "gray",
    ];
    let value = value.unwrap_or(default).trim();
    if allowed.contains(&value) {
        value.to_owned()
    } else {
        default.to_owned()
    }
}

fn normalize_project_status(value: Option<&str>) -> String {
    match value.unwrap_or("planned").trim() {
        "planned" | "in-progress" | "completed" | "cancelled" => {
            value.unwrap_or("planned").trim().to_owned()
        }
        _ => "planned".to_owned(),
    }
}

fn parse_optional_date(value: Option<&str>) -> Result<Option<DateTime<FixedOffset>>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Ok(Some(date));
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return Ok(Some(
            date.and_hms_opt(0, 0, 0).unwrap().and_utc().fixed_offset(),
        ));
    }
    Err(ApiError::BadRequest(
        "Date must be an RFC3339 timestamp or YYYY-MM-DD".to_owned(),
    ))
}
