use axum::{extract::State, routing::get, Extension, Json, Router};
use chrono::Utc;
use entity::{
    workspace,
    workspace_member::{self, WorkspaceRole},
};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use url::Url;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    middleware::Membership,
    slug,
    state::AppState,
};

pub fn top_routes() -> Router<AppState> {
    Router::new().route("/", get(list).post(create))
}

pub fn scoped_routes() -> Router<AppState> {
    Router::new().route("/", get(get_one).patch(update).delete(delete))
}

#[derive(Serialize, ToSchema)]
pub struct WorkspaceView {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub is_personal: bool,
    pub owner_id: Uuid,
    pub role: WorkspaceRole,
    pub status_slug: Option<String>,
    pub status_page_enabled: bool,
    pub status_page_title: Option<String>,
    pub status_page_description: Option<String>,
    #[schema(value_type = Option<Object>)]
    pub status_page_config: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub updated_at: chrono::DateTime<chrono::FixedOffset>,
}

impl WorkspaceView {
    fn build(ws: workspace::Model, role: WorkspaceRole) -> Self {
        Self {
            id: ws.id,
            slug: ws.slug,
            name: ws.name,
            is_personal: ws.is_personal,
            owner_id: ws.owner_id,
            role,
            status_slug: ws.status_slug,
            status_page_enabled: ws.status_page_enabled,
            status_page_title: ws.status_page_title,
            status_page_description: ws.status_page_description,
            status_page_config: ws.status_page_config,
            created_at: ws.created_at,
            updated_at: ws.updated_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct CreateWorkspaceBody {
    pub name: String,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateWorkspaceBody {
    pub name: Option<String>,
    pub slug: Option<String>,
    #[schema(value_type = Option<String>)]
    pub status_slug: Option<Option<String>>,
    pub status_page_enabled: Option<bool>,
    #[schema(value_type = Option<String>)]
    pub status_page_title: Option<Option<String>>,
    #[schema(value_type = Option<String>)]
    pub status_page_description: Option<Option<String>>,
    #[schema(value_type = Option<Object>)]
    pub status_page_config: Option<serde_json::Value>,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[utoipa::path(
    get,
    path = "/api/workspaces",
    responses((status = 200, body = [WorkspaceView])),
    security(("bearerAuth" = [])),
    tag = "workspaces"
)]
pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<WorkspaceView>>> {
    let rows: Vec<(workspace_member::Model, Option<workspace::Model>)> =
        workspace_member::Entity::find()
            .filter(workspace_member::Column::UserId.eq(auth.user.id))
            .find_also_related(workspace::Entity)
            .all(&state.db)
            .await?;

    let mut out = Vec::with_capacity(rows.len());
    for (m, w) in rows {
        if let Some(ws) = w {
            out.push(WorkspaceView::build(ws, m.role));
        }
    }
    Ok(Json(out))
}

#[utoipa::path(
    post,
    path = "/api/workspaces",
    request_body = CreateWorkspaceBody,
    responses(
        (status = 200, body = WorkspaceView),
        (status = 400, description = "name required"),
    ),
    security(("bearerAuth" = [])),
    tag = "workspaces"
)]
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateWorkspaceBody>,
) -> ApiResult<Json<WorkspaceView>> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::bad_request("name required"));
    }

    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    let workspace_slug = slug::unique_workspace_slug(&txn, &name).await?;

    let ws = workspace::ActiveModel {
        id: Set(Uuid::now_v7()),
        slug: Set(workspace_slug),
        name: Set(name),
        is_personal: Set(false),
        owner_id: Set(auth.user.id),
        status_slug: Set(None),
        status_page_enabled: Set(false),
        status_page_title: Set(None),
        status_page_description: Set(None),
        status_page_config: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    workspace_member::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(ws.id),
        user_id: Set(auth.user.id),
        role: Set(WorkspaceRole::Owner),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;

    Ok(Json(WorkspaceView::build(ws, WorkspaceRole::Owner)))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}",
    params(("wid" = Uuid, Path, description = "workspace id")),
    responses(
        (status = 200, body = WorkspaceView),
        (status = 403, description = "Not a member"),
    ),
    security(("bearerAuth" = [])),
    tag = "workspaces"
)]
pub async fn get_one(Extension(m): Extension<Membership>) -> ApiResult<Json<WorkspaceView>> {
    Ok(Json(WorkspaceView::build(m.workspace, m.role)))
}

#[utoipa::path(
    patch,
    path = "/api/workspaces/{wid}",
    params(("wid" = Uuid, Path, description = "workspace id")),
    request_body = UpdateWorkspaceBody,
    responses(
        (status = 200, body = workspace::Model),
        (status = 403, description = "Owner only"),
    ),
    security(("bearerAuth" = [])),
    tag = "workspaces"
)]
pub async fn update(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Json(body): Json<UpdateWorkspaceBody>,
) -> ApiResult<Json<workspace::Model>> {
    m.require_owner()?;
    let mut am: workspace::ActiveModel = m.workspace.into();
    if let Some(name) = body.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(ApiError::bad_request("name cannot be empty"));
        }
        am.name = Set(trimmed.to_string());
    }
    if let Some(app_slug) = body.slug {
        let trimmed = app_slug.trim().to_lowercase();
        if !slug::is_valid_slug(&trimmed) {
            return Err(ApiError::bad_request(
                "workspace slug must be 3-64 chars, lowercase letters/digits/hyphens",
            ));
        }
        if slug::normalize_workspace_slug(&trimmed) != trimmed {
            return Err(ApiError::bad_request("workspace slug is reserved"));
        }
        am.slug = Set(trimmed);
    }
    if let Some(slug_opt) = body.status_slug {
        match slug_opt {
            Some(s) => {
                let trimmed = s.trim().to_lowercase();
                if trimmed.is_empty() {
                    am.status_slug = Set(None);
                } else {
                    if !is_valid_status_slug(&trimmed) {
                        return Err(ApiError::bad_request(
                            "slug must be 3-32 chars, lowercase letters/digits/hyphens",
                        ));
                    }
                    am.status_slug = Set(Some(trimmed));
                }
            }
            None => am.status_slug = Set(None),
        }
    }
    if let Some(v) = body.status_page_enabled {
        am.status_page_enabled = Set(v);
    }
    if let Some(v) = body.status_page_title {
        am.status_page_title = Set(v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
    }
    if let Some(v) = body.status_page_description {
        am.status_page_description = Set(v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
    }
    if let Some(cfg) = body.status_page_config {
        am.status_page_config = Set(if cfg.is_null() {
            None
        } else {
            Some(sanitize_status_page_config(cfg)?)
        });
    }
    am.updated_at = Set(Utc::now().fixed_offset());
    let updated = am.update(&state.db).await.map_err(map_unique_err)?;
    Ok(Json(updated))
}

fn sanitize_status_page_config(mut cfg: serde_json::Value) -> ApiResult<serde_json::Value> {
    let Some(style) = cfg
        .get_mut("style")
        .and_then(serde_json::Value::as_object_mut)
    else {
        return Ok(cfg);
    };

    for key in ["logo_url", "header_link"] {
        let Some(value) = style.get(key) else {
            continue;
        };
        if value.is_null() {
            continue;
        }
        let Some(raw) = value.as_str() else {
            return Err(ApiError::bad_request(format!("{key} must be a URL string")));
        };
        let clean = validate_public_url(raw, key)?;
        style.insert(key.to_string(), serde_json::Value::String(clean));
    }

    Ok(cfg)
}

fn validate_public_url(raw: &str, field: &str) -> ApiResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let url = Url::parse(trimmed)
        .map_err(|_| ApiError::bad_request(format!("{field} must be a valid URL")))?;
    match url.scheme() {
        "http" | "https" => Ok(trimmed.to_string()),
        _ => Err(ApiError::bad_request(format!(
            "{field} must use http or https"
        ))),
    }
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}",
    params(("wid" = Uuid, Path, description = "workspace id")),
    responses(
        (status = 200, body = OkResponse),
        (status = 400, description = "Personal workspace cannot be deleted"),
        (status = 403, description = "Owner only"),
    ),
    security(("bearerAuth" = [])),
    tag = "workspaces"
)]
pub async fn delete(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<OkResponse>> {
    m.require_owner()?;
    if m.workspace.is_personal {
        return Err(ApiError::bad_request(
            "personal workspace cannot be deleted",
        ));
    }
    workspace::Entity::delete_by_id(m.workspace.id)
        .exec(&state.db)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

fn is_valid_status_slug(s: &str) -> bool {
    let len = s.len();
    if !(3..=32).contains(&len) {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !s.starts_with('-')
        && !s.ends_with('-')
}

fn map_unique_err(e: sea_orm::DbErr) -> ApiError {
    let s = e.to_string();
    if s.contains("idx_workspaces_status_slug") {
        return ApiError::conflict("slug already taken");
    }
    if s.contains("idx_workspaces_slug") || s.contains("duplicate key") {
        return ApiError::conflict("workspace slug already taken");
    }
    ApiError::from(e)
}

pub async fn personal_workspace_id(
    db: &sea_orm::DatabaseConnection,
    user_id: Uuid,
) -> Result<Option<Uuid>, ApiError> {
    let row = workspace::Entity::find()
        .filter(workspace::Column::OwnerId.eq(user_id))
        .filter(workspace::Column::IsPersonal.eq(true))
        .one(db)
        .await?;
    Ok(row.map(|w| w.id))
}

#[cfg(test)]
mod tests {
    use super::sanitize_status_page_config;
    use serde_json::json;

    #[test]
    fn rejects_unsafe_status_page_urls() {
        let cfg = json!({
            "style": {
                "header_link": "javascript:alert(1)",
                "logo_url": "https://example.com/logo.svg"
            }
        });

        assert!(sanitize_status_page_config(cfg).is_err());
    }

    #[test]
    fn keeps_safe_status_page_urls() {
        let cfg = json!({
            "style": {
                "header_link": " https://example.com ",
                "logo_url": "http://example.com/logo.svg"
            }
        });

        let sanitized = sanitize_status_page_config(cfg).expect("sanitize");
        assert_eq!(
            sanitized["style"]["header_link"].as_str(),
            Some("https://example.com")
        );
    }
}
