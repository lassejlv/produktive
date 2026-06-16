use axum::{
    extract::{Path, State},
    routing::get,
    Extension, Json, Router,
};
use entity::{
    user,
    workspace_member::{self, WorkspaceRole},
};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseBackend, EntityTrait,
    PaginatorTrait, QueryFilter, Statement, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    billing::track_feature_with_key,
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/{uid}", axum::routing::patch(update_role).delete(remove))
}

#[derive(Serialize, ToSchema)]
pub struct MemberView {
    pub user_id: Uuid,
    pub email: String,
    pub role: WorkspaceRole,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateRole {
    pub role: WorkspaceRole,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/members",
    operation_id = "members_list",
    params(("wid" = Uuid, Path, description = "workspace id")),
    responses((status = 200, body = [MemberView])),
    security(("bearerAuth" = [])),
    tag = "members"
)]
pub async fn list(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<MemberView>>> {
    let rows: Vec<(workspace_member::Model, Option<user::Model>)> =
        workspace_member::Entity::find()
            .filter(workspace_member::Column::WorkspaceId.eq(m.workspace.id))
            .find_also_related(user::Entity)
            .all(&state.db)
            .await?;

    let out = rows
        .into_iter()
        .filter_map(|(wm, u)| {
            u.map(|u| MemberView {
                user_id: u.id,
                email: u.email,
                role: wm.role,
                created_at: wm.created_at,
            })
        })
        .collect();
    Ok(Json(out))
}

#[utoipa::path(
    patch,
    path = "/api/workspaces/{wid}/members/{uid}",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("uid" = Uuid, Path, description = "user id"),
    ),
    request_body = UpdateRole,
    responses(
        (status = 200, body = workspace_member::Model),
        (status = 400, description = "Cannot demote last owner"),
        (status = 403, description = "Owner only"),
        (status = 404, description = "Member not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "members"
)]
pub async fn update_role(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, uid)): Path<(String, Uuid)>,
    Json(body): Json<UpdateRole>,
) -> ApiResult<Json<workspace_member::Model>> {
    m.require_owner()?;
    let txn = state.db.begin().await?;
    lock_workspace_members(&txn, m.workspace.id).await?;

    let target = workspace_member::Entity::find()
        .filter(workspace_member::Column::WorkspaceId.eq(m.workspace.id))
        .filter(workspace_member::Column::UserId.eq(uid))
        .one(&txn)
        .await?
        .ok_or_else(|| ApiError::not_found("member"))?;

    if target.role == WorkspaceRole::Owner && body.role != WorkspaceRole::Owner {
        let owner_count = workspace_member::Entity::find()
            .filter(workspace_member::Column::WorkspaceId.eq(m.workspace.id))
            .filter(workspace_member::Column::Role.eq(WorkspaceRole::Owner))
            .count(&txn)
            .await?;
        if owner_count <= 1 {
            return Err(ApiError::bad_request("cannot demote the last owner"));
        }
    }

    let mut am: workspace_member::ActiveModel = target.into();
    am.role = Set(body.role);
    let updated = am.update(&txn).await?;
    txn.commit().await?;
    Ok(Json(updated))
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/members/{uid}",
    operation_id = "members_remove",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("uid" = Uuid, Path, description = "user id to remove (self-leave allowed)"),
    ),
    responses(
        (status = 200, body = OkResponse),
        (status = 400, description = "Personal workspace / last owner protection"),
        (status = 403, description = "Owner only (unless self-leave)"),
        (status = 404, description = "Member not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "members"
)]
pub async fn remove(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path((_wid, uid)): Path<(String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    let is_self = uid == auth.user.id;
    if !is_self {
        m.require_owner()?;
    }
    let txn = state.db.begin().await?;
    lock_workspace_members(&txn, m.workspace.id).await?;

    let target = workspace_member::Entity::find()
        .filter(workspace_member::Column::WorkspaceId.eq(m.workspace.id))
        .filter(workspace_member::Column::UserId.eq(uid))
        .one(&txn)
        .await?
        .ok_or_else(|| ApiError::not_found("member"))?;

    if m.workspace.is_personal && target.role == WorkspaceRole::Owner {
        return Err(ApiError::bad_request(
            "personal workspace owner cannot leave",
        ));
    }

    if target.role == WorkspaceRole::Owner {
        let owner_count = workspace_member::Entity::find()
            .filter(workspace_member::Column::WorkspaceId.eq(m.workspace.id))
            .filter(workspace_member::Column::Role.eq(WorkspaceRole::Owner))
            .count(&txn)
            .await?;
        if owner_count <= 1 {
            return Err(ApiError::bad_request("cannot remove the last owner"));
        }
    }

    workspace_member::Entity::delete_by_id(target.id)
        .exec(&txn)
        .await?;
    txn.commit().await?;
    track_feature_with_key(
        &state,
        m.workspace.id,
        "members",
        -1.0,
        Some(format!("member-remove-{}-{uid}", m.workspace.id)),
    )
    .await;
    Ok(Json(OkResponse { ok: true }))
}

async fn lock_workspace_members<C>(db: &C, workspace_id: Uuid) -> Result<(), sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "SELECT id FROM workspace_members WHERE workspace_id = $1 FOR UPDATE",
        [workspace_id.into()],
    ))
    .await?;
    Ok(())
}
