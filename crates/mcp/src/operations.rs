use chrono::Utc;
use produktive_entity::{
    issue, issue_comment, issue_event, issue_label, issue_status, label, member, organization,
    produktive_oauth_grant, project, user,
};
use rust_mcp_sdk::schema::schema_utils::CallToolError;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    context::RequestContext,
    error::{db_tool_error, tool_error},
    state::AppState,
    tools::{
        CreateIssueCommentTool, CreateIssueTool, CreateLabelTool, CreateProjectTool, GetIssueTool,
        ListIssueCommentsTool, ListIssuesTool, ListLabelsTool, ListProjectsTool,
        SelectWorkspaceTool, UpdateIssueTool, UpdateLabelTool, UpdateProjectTool,
    },
    util::{
        non_empty, normalize_assignee, normalize_color, normalize_ids, normalize_optional_string,
        normalize_project_status, parse_optional_date, push_change, required,
    },
};

pub(crate) async fn list_workspaces(
    state: &AppState,
    ctx: &RequestContext,
) -> Result<Value, CallToolError> {
    let memberships = member::Entity::find()
        .filter(member::Column::UserId.eq(&ctx.user_id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;

    let mut workspaces = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(org) = organization::Entity::find_by_id(&membership.organization_id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
        {
            workspaces.push(json!({
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "role": membership.role,
                "selected": ctx.organization_id.as_deref() == Some(org.id.as_str()),
            }));
        }
    }

    Ok(json!({ "workspaces": workspaces }))
}

pub(crate) async fn current_workspace(
    state: &AppState,
    ctx: &RequestContext,
) -> Result<Value, CallToolError> {
    let Some(id) = ctx.organization_id.as_deref() else {
        return Ok(json!({ "workspace": null }));
    };
    let workspace = organization::Entity::find_by_id(id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?;
    Ok(json!({ "workspace": workspace }))
}

pub(crate) async fn select_workspace(
    state: &AppState,
    ctx: &RequestContext,
    args: SelectWorkspaceTool,
) -> Result<Value, CallToolError> {
    let organization_id = required(args.organization_id, "organization_id")?;
    ensure_member(state, &ctx.user_id, &organization_id).await?;
    let org = organization::Entity::find_by_id(&organization_id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error("Workspace not found"))?;

    let grant = produktive_oauth_grant::Entity::find_by_id(&ctx.grant_id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error("MCP OAuth grant no longer exists"))?;
    let mut active = grant.into_active_model();
    active.selected_organization_id = Set(Some(org.id.clone()));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await.map_err(db_tool_error)?;

    Ok(json!({
        "selected": true,
        "workspace": { "id": org.id, "name": org.name, "slug": org.slug }
    }))
}

pub(crate) async fn list_members(
    state: &AppState,
    ctx: &RequestContext,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let memberships = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;

    let mut members = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(user) = user::Entity::find_by_id(&membership.user_id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
        {
            members.push(json!({
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "image": user.image,
                "role": membership.role,
            }));
        }
    }
    Ok(json!({ "members": members }))
}

pub(crate) async fn list_labels(
    state: &AppState,
    ctx: &RequestContext,
    args: ListLabelsTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .order_by_asc(label::Column::Name);
    if !args.include_archived.unwrap_or(false) {
        select = select.filter(label::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    let mut labels = Vec::with_capacity(rows.len());
    for row in rows {
        labels.push(label_json(state, row).await?);
    }
    Ok(json!({ "labels": labels }))
}

pub(crate) async fn create_label(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateLabelTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let name = required(args.name, "name")?;
    if name.chars().count() > 48 {
        return Err(tool_error("Label name must be 48 characters or fewer"));
    }
    ensure_unique_label_name(state, organization_id, &name, None).await?;

    let now = Utc::now().fixed_offset();
    let row = label::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        name: Set(name),
        description: Set(non_empty(args.description)),
        color: Set(normalize_color(args.color.as_deref(), "gray")),
        created_by_id: Set(Some(ctx.user_id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    Ok(json!({ "label": label_json(state, row).await? }))
}

pub(crate) async fn update_label(
    state: &AppState,
    ctx: &RequestContext,
    args: UpdateLabelTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let id = required(args.id, "id")?;
    let existing = find_label(state, organization_id, &id).await?;
    let existing_id = existing.id.clone();
    let mut active = existing.into_active_model();

    if let Some(name) = args.name {
        let name = required(name, "name")?;
        if name.chars().count() > 48 {
            return Err(tool_error("Label name must be 48 characters or fewer"));
        }
        ensure_unique_label_name(state, organization_id, &name, Some(&existing_id)).await?;
        active.name = Set(name);
    }
    if let Some(description) = args.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(color) = args.color {
        active.color = Set(normalize_color(Some(&color), "gray"));
    }
    if let Some(archived) = args.archived {
        active.archived_at = Set(if archived {
            Some(Utc::now().fixed_offset())
        } else {
            None
        });
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await.map_err(db_tool_error)?;
    Ok(json!({ "label": label_json(state, updated).await? }))
}

pub(crate) async fn list_projects(
    state: &AppState,
    ctx: &RequestContext,
    args: ListProjectsTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let mut select = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .order_by_asc(project::Column::ArchivedAt)
        .order_by_asc(project::Column::SortOrder)
        .order_by_desc(project::Column::CreatedAt);
    if !args.include_archived.unwrap_or(false) {
        select = select.filter(project::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    let mut projects = Vec::with_capacity(rows.len());
    for row in rows {
        projects.push(project_json(state, row).await?);
    }
    Ok(json!({ "projects": projects }))
}

pub(crate) async fn create_project(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateProjectTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let name = required(args.name, "name")?;
    let lead_id = normalize_optional_string(args.lead_id);
    if let Some(id) = lead_id.as_deref() {
        ensure_member(state, id, organization_id).await?;
    }
    let target_date = parse_optional_date(args.target_date.as_deref())?;
    let next_order = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .select_only()
        .column_as(project::Column::SortOrder.max(), "max_order")
        .into_tuple::<Option<i32>>()
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .flatten()
        .unwrap_or(0)
        + 1;
    let now = Utc::now().fixed_offset();
    let row = project::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        name: Set(name),
        description: Set(non_empty(args.description)),
        status: Set(normalize_project_status(args.status.as_deref())),
        color: Set(normalize_color(args.color.as_deref(), "blue")),
        icon: Set(normalize_optional_string(args.icon)),
        lead_id: Set(lead_id),
        target_date: Set(target_date),
        sort_order: Set(next_order),
        created_by_id: Set(Some(ctx.user_id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    Ok(json!({ "project": project_json(state, row).await? }))
}

pub(crate) async fn update_project(
    state: &AppState,
    ctx: &RequestContext,
    args: UpdateProjectTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let id = required(args.id, "id")?;
    let existing = find_project(state, organization_id, &id).await?;
    let mut active = existing.into_active_model();

    if let Some(name) = args.name {
        active.name = Set(required(name, "name")?);
    }
    if let Some(description) = args.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(status) = args.status {
        active.status = Set(normalize_project_status(Some(&status)));
    }
    if let Some(color) = args.color {
        active.color = Set(normalize_color(Some(&color), "blue"));
    }
    if let Some(icon) = args.icon {
        active.icon = Set(normalize_optional_string(Some(icon)));
    }
    if let Some(lead_id) = args.lead_id {
        let lead_id = normalize_optional_string(Some(lead_id));
        if let Some(id) = lead_id.as_deref() {
            ensure_member(state, id, organization_id).await?;
        }
        active.lead_id = Set(lead_id);
    }
    if let Some(target_date) = args.target_date {
        active.target_date = Set(parse_optional_date(Some(&target_date))?);
    }
    if let Some(archived) = args.archived {
        active.archived_at = Set(if archived {
            Some(Utc::now().fixed_offset())
        } else {
            None
        });
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await.map_err(db_tool_error)?;
    Ok(json!({ "project": project_json(state, updated).await? }))
}

pub(crate) async fn list_issues(
    state: &AppState,
    ctx: &RequestContext,
    args: ListIssuesTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(args.limit.unwrap_or(50).clamp(1, 100));

    if let Some(status) = non_empty(args.status) {
        let status = validate_issue_status(state, organization_id, status).await?;
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = non_empty(args.priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    if let Some(assignee) = non_empty(args.assigned_to_id) {
        select = select.filter(issue::Column::AssignedToId.eq(assignee));
    }
    if let Some(project_id) = non_empty(args.project_id) {
        select = select.filter(issue::Column::ProjectId.eq(project_id));
    }
    let mut label_ids = args.label_ids.unwrap_or_default();
    if let Some(label_id) = args.label_id {
        label_ids.push(label_id);
    }
    let label_ids = normalize_ids(label_ids);
    if !label_ids.is_empty() {
        validate_labels(state, organization_id, &label_ids).await?;
        let joins = issue_label::Entity::find()
            .filter(issue_label::Column::LabelId.is_in(label_ids))
            .all(&state.db)
            .await
            .map_err(db_tool_error)?;
        let issue_ids = normalize_ids(joins.into_iter().map(|join| join.issue_id).collect());
        if issue_ids.is_empty() {
            return Ok(json!({ "issues": [] }));
        }
        select = select.filter(issue::Column::Id.is_in(issue_ids));
    }

    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    let mut issues = Vec::with_capacity(rows.len());
    for row in rows {
        issues.push(issue_json(state, &row, false).await?);
    }
    Ok(json!({ "issues": issues }))
}

pub(crate) async fn get_issue(
    state: &AppState,
    ctx: &RequestContext,
    args: GetIssueTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let issue = find_issue(state, organization_id, &args.id).await?;
    Ok(json!({ "issue": issue_json(state, &issue, true).await? }))
}

pub(crate) async fn create_issue(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateIssueTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let title = required(args.title, "title")?;
    let assigned_to_id = normalize_assignee(args.assigned_to_id);
    if let Some(id) = assigned_to_id.as_deref() {
        ensure_member(state, id, organization_id).await?;
    }
    let project_id = normalize_optional_string(args.project_id);
    if let Some(id) = project_id.as_deref() {
        find_project(state, organization_id, id).await?;
    }
    let label_ids = normalize_ids(args.label_ids.unwrap_or_default());
    validate_labels(state, organization_id, &label_ids).await?;

    let status = match non_empty(args.status) {
        Some(status) => validate_issue_status(state, organization_id, status).await?,
        None => "backlog".to_owned(),
    };

    let now = Utc::now().fixed_offset();
    let row = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        title: Set(title),
        description: Set(non_empty(args.description)),
        status: Set(status),
        priority: Set(non_empty(args.priority).unwrap_or_else(|| "medium".to_owned())),
        created_by_id: Set(Some(ctx.user_id.clone())),
        assigned_to_id: Set(assigned_to_id),
        parent_id: Set(None),
        project_id: Set(project_id),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;
    replace_issue_labels(state, &row.id, &label_ids).await?;

    record_event(
        state,
        organization_id,
        &row.id,
        Some(&ctx.user_id),
        "created",
        json!([
            {"field": "title", "before": null, "after": row.title},
            {"field": "status", "before": null, "after": row.status},
            {"field": "priority", "before": null, "after": row.priority},
            {"field": "projectId", "before": null, "after": row.project_id},
            {"field": "labelIds", "before": null, "after": label_ids}
        ]),
    )
    .await?;

    Ok(json!({ "issue": issue_json(state, &row, true).await? }))
}

pub(crate) async fn update_issue(
    state: &AppState,
    ctx: &RequestContext,
    args: UpdateIssueTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let before = find_issue(state, organization_id, &args.id).await?;
    let mut active = before.clone().into_active_model();
    let mut changes = Vec::new();

    if let Some(title) = args.title {
        let next = required(title, "title")?;
        push_change(&mut changes, "title", Some(&before.title), Some(&next));
        active.title = Set(next);
    }
    if let Some(description) = args.description {
        let next = non_empty(Some(description));
        push_change(
            &mut changes,
            "description",
            before.description.as_deref(),
            next.as_deref(),
        );
        active.description = Set(next);
    }
    if let Some(status) = args.status {
        let status = required(status, "status")?;
        let next = validate_issue_status(state, organization_id, status).await?;
        push_change(&mut changes, "status", Some(&before.status), Some(&next));
        active.status = Set(next);
    }
    if let Some(priority) = args.priority {
        let next = required(priority, "priority")?;
        push_change(
            &mut changes,
            "priority",
            Some(&before.priority),
            Some(&next),
        );
        active.priority = Set(next);
    }
    if let Some(raw_assignee) = args.assigned_to_id {
        let next = normalize_assignee(Some(raw_assignee));
        if let Some(id) = next.as_deref() {
            ensure_member(state, id, organization_id).await?;
        }
        push_change(
            &mut changes,
            "assignedToId",
            before.assigned_to_id.as_deref(),
            next.as_deref(),
        );
        active.assigned_to_id = Set(next);
    }
    if let Some(raw_project_id) = args.project_id {
        let next = normalize_optional_string(Some(raw_project_id));
        if let Some(id) = next.as_deref() {
            find_project(state, organization_id, id).await?;
        }
        push_change(
            &mut changes,
            "projectId",
            before.project_id.as_deref(),
            next.as_deref(),
        );
        active.project_id = Set(next);
    }

    if let Some(label_ids) = args.label_ids {
        let label_ids = normalize_ids(label_ids);
        validate_labels(state, organization_id, &label_ids).await?;
        let before_label_ids = labels_for_issue(state, &before.id)
            .await?
            .into_iter()
            .map(|label| label.id)
            .collect::<Vec<_>>();
        if before_label_ids != label_ids {
            changes.push(json!({
                "field": "labelIds",
                "before": before_label_ids,
                "after": label_ids,
            }));
            replace_issue_labels(state, &before.id, &label_ids).await?;
        }
    }

    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await.map_err(db_tool_error)?;
    if !changes.is_empty() {
        record_event(
            state,
            organization_id,
            &updated.id,
            Some(&ctx.user_id),
            "updated",
            Value::Array(changes.clone()),
        )
        .await?;
    }

    Ok(json!({
        "issue": issue_json(state, &updated, true).await?,
        "changes": changes,
    }))
}

pub(crate) async fn list_issue_comments(
    state: &AppState,
    ctx: &RequestContext,
    args: ListIssueCommentsTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    find_issue(state, organization_id, &args.issue_id).await?;
    let rows = issue_comment::Entity::find()
        .filter(issue_comment::Column::OrganizationId.eq(organization_id))
        .filter(issue_comment::Column::IssueId.eq(&args.issue_id))
        .order_by_asc(issue_comment::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;

    let mut comments = Vec::with_capacity(rows.len());
    for row in rows {
        comments.push(comment_json(state, row).await?);
    }
    Ok(json!({ "comments": comments }))
}

pub(crate) async fn create_issue_comment(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateIssueCommentTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let found = find_issue(state, organization_id, &args.issue_id).await?;
    let body = required(args.body, "body")?;
    let now = Utc::now().fixed_offset();
    let row = issue_comment::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        issue_id: Set(found.id.clone()),
        author_id: Set(Some(ctx.user_id.clone())),
        body: Set(body),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    let mut active = found.into_active_model();
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await.map_err(db_tool_error)?;

    Ok(json!({ "comment": comment_json(state, row).await? }))
}

async fn find_issue(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<issue::Model, CallToolError> {
    issue::Entity::find()
        .filter(issue::Column::Id.eq(id))
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error(format!("Issue {id} not found")))
}

async fn find_label(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<label::Model, CallToolError> {
    label::Entity::find_by_id(id)
        .filter(label::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error(format!("Label {id} not found")))
}

async fn find_project(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<project::Model, CallToolError> {
    project::Entity::find_by_id(id)
        .filter(project::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error(format!("Project {id} not found")))
}

async fn issue_json(
    state: &AppState,
    issue: &issue::Model,
    full: bool,
) -> Result<Value, CallToolError> {
    let assigned_to = match issue.assigned_to_id.as_deref() {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|user| json!({ "id": user.id, "name": user.name, "email": user.email })),
        None => None,
    };
    let project = match issue.project_id.as_deref() {
        Some(id) => project::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|project| {
                json!({
                    "id": project.id,
                    "name": project.name,
                    "status": project.status,
                    "color": project.color,
                    "icon": project.icon,
                })
            }),
        None => None,
    };
    let labels = labels_for_issue(state, &issue.id)
        .await?
        .into_iter()
        .map(|label| json!({ "id": label.id, "name": label.name, "color": label.color }))
        .collect::<Vec<_>>();

    let mut value = json!({
        "id": issue.id,
        "title": issue.title,
        "status": issue.status,
        "priority": issue.priority,
        "assigned_to": assigned_to,
        "project": project,
        "labels": labels,
        "created_at": issue.created_at.to_rfc3339(),
        "updated_at": issue.updated_at.to_rfc3339(),
    });
    if full {
        value["description"] = issue
            .description
            .as_ref()
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
        value["attachments"] = issue.attachments.clone().unwrap_or_else(|| json!([]));
        value["parent_id"] = issue
            .parent_id
            .as_ref()
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
        value["project_id"] = issue
            .project_id
            .as_ref()
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
    }
    Ok(value)
}

async fn label_json(state: &AppState, row: label::Model) -> Result<Value, CallToolError> {
    let issue_count = issue_label::Entity::find()
        .filter(issue_label::Column::LabelId.eq(&row.id))
        .count(&state.db)
        .await
        .map_err(db_tool_error)?;
    Ok(json!({
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "color": row.color,
        "archived_at": row.archived_at.map(|value| value.to_rfc3339()),
        "created_at": row.created_at.to_rfc3339(),
        "updated_at": row.updated_at.to_rfc3339(),
        "issue_count": issue_count,
    }))
}

async fn project_json(state: &AppState, row: project::Model) -> Result<Value, CallToolError> {
    let lead = match row.lead_id.as_deref() {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|user| json!({ "id": user.id, "name": user.name, "email": user.email, "image": user.image })),
        None => None,
    };
    let mut backlog = 0_u64;
    let mut todo = 0_u64;
    let mut in_progress = 0_u64;
    let mut done = 0_u64;
    let categories = issue_status_categories(state, &row.organization_id).await?;
    let issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    let issue_count = issues.len() as u64;
    for issue in &issues {
        match categories
            .get(&issue.status)
            .map(String::as_str)
            .unwrap_or("active")
        {
            "backlog" => backlog += 1,
            "active" => {
                if issue.status == "in-progress" {
                    in_progress += 1;
                } else {
                    todo += 1;
                }
            }
            "done" => done += 1,
            "canceled" => {}
            _ => {}
        }
    }
    Ok(json!({
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "color": row.color,
        "icon": row.icon,
        "lead_id": row.lead_id,
        "lead": lead,
        "target_date": row.target_date.map(|value| value.to_rfc3339()),
        "sort_order": row.sort_order,
        "archived_at": row.archived_at.map(|value| value.to_rfc3339()),
        "created_at": row.created_at.to_rfc3339(),
        "updated_at": row.updated_at.to_rfc3339(),
        "issue_count": issue_count,
        "done_count": done,
        "status_breakdown": {
            "backlog": backlog,
            "todo": todo,
            "in_progress": in_progress,
            "done": done,
        },
    }))
}

async fn comment_json(
    state: &AppState,
    comment: issue_comment::Model,
) -> Result<Value, CallToolError> {
    let author = match comment.author_id.as_deref() {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|user| json!({ "id": user.id, "name": user.name, "email": user.email })),
        None => None,
    };
    Ok(json!({
        "id": comment.id,
        "body": comment.body,
        "author": author,
        "created_at": comment.created_at.to_rfc3339(),
        "updated_at": comment.updated_at.to_rfc3339(),
    }))
}

async fn ensure_member(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<(), CallToolError> {
    let exists = member::Entity::find()
        .filter(member::Column::UserId.eq(user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .is_some();
    if exists {
        Ok(())
    } else {
        Err(tool_error("User is not a member of that workspace"))
    }
}

async fn validate_labels(
    state: &AppState,
    organization_id: &str,
    label_ids: &[String],
) -> Result<(), CallToolError> {
    if label_ids.is_empty() {
        return Ok(());
    }
    let rows = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::Id.is_in(label_ids.iter().cloned()))
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    if rows.len() != label_ids.len() {
        return Err(tool_error("One or more labels are invalid"));
    }
    if rows.iter().any(|row| row.archived_at.is_some()) {
        return Err(tool_error("Cannot attach an archived label"));
    }
    Ok(())
}

fn default_issue_status_category(key: &str) -> Option<&'static str> {
    match key {
        "backlog" => Some("backlog"),
        "todo" | "in-progress" => Some("active"),
        "done" => Some("done"),
        "canceled" => Some("canceled"),
        _ => None,
    }
}

async fn issue_status_categories(
    state: &AppState,
    organization_id: &str,
) -> Result<HashMap<String, String>, CallToolError> {
    let mut categories = HashMap::from([
        ("backlog".to_owned(), "backlog".to_owned()),
        ("todo".to_owned(), "active".to_owned()),
        ("in-progress".to_owned(), "active".to_owned()),
        ("done".to_owned(), "done".to_owned()),
        ("canceled".to_owned(), "canceled".to_owned()),
    ]);
    let rows = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .filter(issue_status::Column::ArchivedAt.is_null())
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    for row in rows {
        categories.insert(row.key, row.category);
    }
    Ok(categories)
}

async fn validate_issue_status(
    state: &AppState,
    organization_id: &str,
    status: String,
) -> Result<String, CallToolError> {
    let status = required(status, "status")?;
    if default_issue_status_category(&status).is_some() {
        return Ok(status);
    }
    let exists = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .filter(issue_status::Column::Key.eq(&status))
        .filter(issue_status::Column::ArchivedAt.is_null())
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .is_some();
    if exists {
        Ok(status)
    } else {
        Err(tool_error("Status does not exist"))
    }
}

async fn replace_issue_labels(
    state: &AppState,
    issue_id: &str,
    label_ids: &[String],
) -> Result<(), CallToolError> {
    issue_label::Entity::delete_many()
        .filter(issue_label::Column::IssueId.eq(issue_id))
        .exec(&state.db)
        .await
        .map_err(db_tool_error)?;
    if label_ids.is_empty() {
        return Ok(());
    }
    let now = Utc::now().fixed_offset();
    for label_id in label_ids {
        issue_label::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            issue_id: Set(issue_id.to_owned()),
            label_id: Set(label_id.clone()),
            created_at: Set(now),
        }
        .insert(&state.db)
        .await
        .map_err(db_tool_error)?;
    }
    Ok(())
}

async fn labels_for_issue(
    state: &AppState,
    issue_id: &str,
) -> Result<Vec<label::Model>, CallToolError> {
    let joins = issue_label::Entity::find()
        .filter(issue_label::Column::IssueId.eq(issue_id))
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    if joins.is_empty() {
        return Ok(Vec::new());
    }
    let ids = joins
        .into_iter()
        .map(|join| join.label_id)
        .collect::<Vec<_>>();
    label::Entity::find()
        .filter(label::Column::Id.is_in(ids))
        .order_by_asc(label::Column::Name)
        .all(&state.db)
        .await
        .map_err(db_tool_error)
}

async fn ensure_unique_label_name(
    state: &AppState,
    organization_id: &str,
    name: &str,
    exclude_id: Option<&str>,
) -> Result<(), CallToolError> {
    let lowered = name.to_lowercase();
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::ArchivedAt.is_null());
    if let Some(id) = exclude_id {
        select = select.filter(label::Column::Id.ne(id));
    }
    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    if rows.iter().any(|row| row.name.to_lowercase() == lowered) {
        return Err(tool_error("A label with this name already exists"));
    }
    Ok(())
}

async fn record_event(
    state: &AppState,
    organization_id: &str,
    issue_id: &str,
    actor_id: Option<&str>,
    action: &str,
    changes: Value,
) -> Result<(), CallToolError> {
    issue_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        issue_id: Set(issue_id.to_owned()),
        actor_id: Set(actor_id.map(str::to_owned)),
        action: Set(action.to_owned()),
        changes: Set(changes),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;
    Ok(())
}
