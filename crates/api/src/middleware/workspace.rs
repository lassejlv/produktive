use std::collections::HashMap;

use axum::{
    extract::{Path, Request, State},
    middleware::Next,
    response::Response,
};
use entity::{
    workspace,
    workspace_member::{self, WorkspaceRole},
};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use uuid::Uuid;

use crate::{auth::AuthUser, error::ApiError, state::AppState};

#[derive(Clone)]
pub struct Membership {
    pub workspace: workspace::Model,
    pub role: WorkspaceRole,
}

impl Membership {
    pub fn require_owner(&self) -> Result<(), ApiError> {
        match self.role {
            WorkspaceRole::Owner => Ok(()),
            _ => Err(ApiError::Forbidden),
        }
    }
}

pub async fn workspace_guard(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(params): Path<HashMap<String, String>>,
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let wid_str = params
        .get("wid")
        .ok_or_else(|| ApiError::bad_request("missing workspace id"))?;

    let ws = resolve_workspace(&state, wid_str).await?;
    let wid = ws.id;

    let member = workspace_member::Entity::find()
        .filter(workspace_member::Column::WorkspaceId.eq(wid))
        .filter(workspace_member::Column::UserId.eq(auth.user.id))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Forbidden)?;

    let _ = auth;
    req.extensions_mut().insert(Membership {
        workspace: ws,
        role: member.role,
    });
    Ok(next.run(req).await)
}

async fn resolve_workspace(state: &AppState, ident: &str) -> Result<workspace::Model, ApiError> {
    if let Ok(id) = Uuid::parse_str(ident) {
        if let Some(ws) = workspace::Entity::find_by_id(id).one(&state.db).await? {
            return Ok(ws);
        }
    }

    let slug = ident.trim().to_lowercase();
    if !crate::slug::is_valid_slug(&slug) {
        return Err(ApiError::bad_request("invalid workspace"));
    }

    workspace::Entity::find()
        .filter(workspace::Column::Slug.eq(slug))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("workspace"))
}
