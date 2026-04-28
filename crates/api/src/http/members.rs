use crate::{auth::require_auth, error::ApiError, issue_history::IssueChange, state::AppState};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use produktive_entity::{issue, issue_event, member, user};
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect};
use serde::Serialize;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_members))
        .route("/{id}", get(get_member))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MembersEnvelope {
    members: Vec<MemberSummaryResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberSummaryResponse {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
    role: String,
}

async fn list_members(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<MembersEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let memberships = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut members = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(user) = user::Entity::find_by_id(&membership.user_id)
            .one(&state.db)
            .await?
        {
            members.push(MemberSummaryResponse {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                role: membership.role,
            });
        }
    }

    Ok(Json(MembersEnvelope { members }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberEnvelope {
    member: MemberProfileResponse,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberProfileResponse {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
    role: String,
    joined_at: String,
    stats: MemberStatsResponse,
    assigned_issues: Vec<MemberIssueResponse>,
    created_issues: Vec<MemberIssueResponse>,
    activity: Vec<MemberActivityResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberStatsResponse {
    assigned_issues: u64,
    created_issues: u64,
    activity_events: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberIssueResponse {
    id: String,
    title: String,
    status: String,
    priority: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberActivityResponse {
    id: String,
    action: String,
    changes: Vec<IssueChange>,
    created_at: String,
    issue: Option<MemberIssueResponse>,
}

async fn get_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<MemberEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let membership = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Member not found".to_owned()))?;

    let user = user::Entity::find_by_id(&membership.user_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Member not found".to_owned()))?;

    let assigned_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue::Column::AssignedToId.eq(&user.id))
        .count(&state.db)
        .await?;
    let created_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue::Column::CreatedById.eq(&user.id))
        .count(&state.db)
        .await?;
    let activity_count = issue_event::Entity::find()
        .filter(issue_event::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue_event::Column::ActorId.eq(&user.id))
        .count(&state.db)
        .await?;

    let assigned_issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue::Column::AssignedToId.eq(&user.id))
        .order_by_desc(issue::Column::UpdatedAt)
        .limit(12)
        .all(&state.db)
        .await?
        .into_iter()
        .map(issue_response)
        .collect();

    let created_issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue::Column::CreatedById.eq(&user.id))
        .order_by_desc(issue::Column::UpdatedAt)
        .limit(12)
        .all(&state.db)
        .await?
        .into_iter()
        .map(issue_response)
        .collect();

    let events = issue_event::Entity::find()
        .filter(issue_event::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue_event::Column::ActorId.eq(&user.id))
        .order_by_desc(issue_event::Column::CreatedAt)
        .limit(30)
        .all(&state.db)
        .await?;

    let mut activity = Vec::with_capacity(events.len());
    for event in events {
        let related_issue = issue::Entity::find()
            .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
            .filter(issue::Column::Id.eq(&event.issue_id))
            .one(&state.db)
            .await?
            .map(issue_response);
        activity.push(MemberActivityResponse {
            id: event.id,
            action: event.action,
            changes: serde_json::from_value(event.changes).unwrap_or_default(),
            created_at: event.created_at.to_rfc3339(),
            issue: related_issue,
        });
    }

    Ok(Json(MemberEnvelope {
        member: MemberProfileResponse {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: membership.role,
            joined_at: membership.created_at.to_rfc3339(),
            stats: MemberStatsResponse {
                assigned_issues: assigned_count,
                created_issues: created_count,
                activity_events: activity_count,
            },
            assigned_issues,
            created_issues,
            activity,
        },
    }))
}

fn issue_response(issue: issue::Model) -> MemberIssueResponse {
    MemberIssueResponse {
        id: issue.id,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        updated_at: issue.updated_at.to_rfc3339(),
    }
}
