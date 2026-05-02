use crate::{
    auth::require_auth,
    error::ApiError,
    issue_history::IssueChange,
    permissions::{
        self, is_privileged_member_role, member_role, require_permission, role_exists,
        MEMBERS_ASSIGN_ROLE, MEMBERS_REMOVE, ROLE_OWNER,
    },
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{issue, issue_event, member, session, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(list_members)).route(
        "/{id}",
        get(get_member)
            .patch(update_member_role)
            .delete(remove_member),
    )
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMemberRoleRequest {
    role: String,
}

async fn update_member_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateMemberRoleRequest>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, MEMBERS_ASSIGN_ROLE).await?;

    let target = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Member not found".to_owned()))?;

    let new_role = payload.role.trim();
    if new_role.is_empty() {
        return Err(ApiError::BadRequest("Role is required".to_owned()));
    }
    if !role_exists(&state.db, &auth.organization.id, new_role).await? {
        return Err(ApiError::BadRequest("Role does not exist".to_owned()));
    }

    let actor_role = member_role(&state.db, &auth.user.id, &auth.organization.id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;
    if actor_role != ROLE_OWNER
        && (is_privileged_member_role(&target.role) || is_privileged_member_role(new_role))
    {
        return Err(ApiError::Forbidden(
            "Only owners can change admin or owner roles".to_owned(),
        ));
    }
    if target.role == ROLE_OWNER && new_role != ROLE_OWNER {
        ensure_not_last_owner(&state, &auth.organization.id, Some(&target.user_id)).await?;
    }

    let mut active = target.into_active_model();
    active.role = Set(new_role.to_owned());
    active.update(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn remove_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, MEMBERS_REMOVE).await?;

    if id == auth.user.id {
        return Err(ApiError::BadRequest(
            "Use leave workspace to remove your own access".to_owned(),
        ));
    }

    let target = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Member not found".to_owned()))?;

    let actor_role = member_role(&state.db, &auth.user.id, &auth.organization.id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;
    if is_privileged_member_role(&target.role) {
        if actor_role != ROLE_OWNER {
            return Err(ApiError::Forbidden(
                "Only owners can remove admins or owners".to_owned(),
            ));
        }
        if target.role == ROLE_OWNER {
            ensure_not_last_owner(&state, &auth.organization.id, Some(&target.user_id)).await?;
        }
    }

    member::Entity::delete_by_id(&target.id)
        .exec(&state.db)
        .await?;

    let now = Utc::now().fixed_offset();
    let sessions = session::Entity::find()
        .filter(session::Column::UserId.eq(&id))
        .filter(session::Column::ActiveOrganizationId.eq(&auth.organization.id))
        .filter(session::Column::RevokedAt.is_null())
        .all(&state.db)
        .await?;
    for session in sessions {
        let mut active = session.into_active_model();
        active.revoked_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn ensure_not_last_owner(
    state: &AppState,
    organization_id: &str,
    excluding_user_id: Option<&str>,
) -> Result<(), ApiError> {
    let owners = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .filter(member::Column::Role.eq(permissions::ROLE_OWNER))
        .all(&state.db)
        .await?;
    let remaining = owners
        .into_iter()
        .filter(|owner| excluding_user_id != Some(owner.user_id.as_str()))
        .count();
    if remaining == 0 {
        return Err(ApiError::BadRequest(
            "A workspace must keep at least one owner".to_owned(),
        ));
    }
    Ok(())
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
