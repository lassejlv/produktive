use std::collections::HashMap;

use axum::{
    extract::{Path, Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};
use entity::{
    workspace,
    workspace_member::{self, WorkspaceRole},
};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use uuid::Uuid;

use crate::{auth::AuthUser, billing::workspace_has_paid_plan, error::ApiError, state::AppState};

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

    if workspace_upgrade_required(&state, &ws, req.method(), req.uri().path()).await? {
        return Err(ApiError::payment_required(
            "additional workspaces require the Usage-based plan",
        ));
    }

    let _ = auth;
    req.extensions_mut().insert(Membership {
        workspace: ws,
        role: member.role,
    });
    Ok(next.run(req).await)
}

async fn workspace_upgrade_required(
    state: &AppState,
    ws: &workspace::Model,
    method: &Method,
    path: &str,
) -> Result<bool, ApiError> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(false);
    };
    if billing.catalog.default_paid_tier().is_none()
        || ws.is_personal
        || is_billing_access_path(method, path)
    {
        return Ok(false);
    }

    match workspace_has_paid_plan(state, ws.id).await {
        Ok(true) => Ok(false),
        Ok(false) => Ok(true),
        Err(error) => {
            tracing::warn!(
                workspace_id = %ws.id,
                error = ?error,
                "could not determine workspace billing plan; restricting workspace access"
            );
            Ok(true)
        }
    }
}

fn is_billing_access_path(method: &Method, path: &str) -> bool {
    if path.contains("/billing") {
        return true;
    }
    if *method != Method::GET {
        return false;
    }
    path.strip_prefix("/api/workspaces/")
        .map(|rest| !rest.trim_matches('/').contains('/'))
        .unwrap_or(false)
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
