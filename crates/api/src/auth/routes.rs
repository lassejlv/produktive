use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use entity::{
    session, user, workspace,
    workspace_member::{self, WorkspaceRole},
};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::{jwt, password, AuthUser},
    error::{ApiError, ApiResult},
    http::workspaces::personal_workspace_id,
    rate_limit::{self, AuthLimitKind},
    slug,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
}

#[derive(Deserialize, ToSchema)]
pub struct CredsPayload {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct UserView {
    pub id: Uuid,
    pub email: String,
    pub is_admin: bool,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
}

impl From<user::Model> for UserView {
    fn from(u: user::Model) -> Self {
        Self {
            id: u.id,
            email: u.email,
            is_admin: u.is_admin,
            created_at: u.created_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct RegisterResponse {
    pub user: UserView,
    pub personal_workspace_id: Uuid,
}

#[derive(Serialize, ToSchema)]
pub struct MeResponse {
    pub id: Uuid,
    pub email: String,
    pub is_admin: bool,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub personal_workspace_id: Option<Uuid>,
}

#[derive(Serialize, ToSchema)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserView,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[utoipa::path(
    post,
    path = "/api/auth/register",
    request_body = CredsPayload,
    responses(
        (status = 200, body = RegisterResponse, description = "User created and personal workspace assigned"),
        (status = 400, description = "Invalid email or password"),
        (status = 409, description = "Email already registered"),
    ),
    tag = "auth"
)]
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CredsPayload>,
) -> ApiResult<Json<RegisterResponse>> {
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') {
        return Err(ApiError::bad_request("invalid email"));
    }
    if body.password.len() < 8 {
        return Err(ApiError::bad_request("password must be at least 8 chars"));
    }
    rate_limit::check_auth(&state, &headers, &email, AuthLimitKind::Register).await?;

    let exists = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?;
    if exists.is_some() {
        return Err(ApiError::conflict("email already registered"));
    }

    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;

    let user_model = user::ActiveModel {
        id: Set(Uuid::now_v7()),
        email: Set(email.clone()),
        password_hash: Set(password::hash(&body.password)?),
        is_admin: Set(state.config.is_admin_email(&email)),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    let workspace_name = personal_workspace_name(&email);
    let workspace_slug = slug::unique_workspace_slug(&txn, &workspace_name).await?;
    let ws = workspace::ActiveModel {
        id: Set(Uuid::now_v7()),
        slug: Set(workspace_slug),
        name: Set(workspace_name),
        is_personal: Set(true),
        owner_id: Set(user_model.id),
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
        user_id: Set(user_model.id),
        role: Set(WorkspaceRole::Owner),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;

    Ok(Json(RegisterResponse {
        user: user_model.into(),
        personal_workspace_id: ws.id,
    }))
}

fn personal_workspace_name(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("user");
    format!("{local}'s workspace")
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = CredsPayload,
    responses(
        (status = 200, body = AuthResponse),
        (status = 401, description = "Invalid credentials"),
    ),
    tag = "auth"
)]
pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CredsPayload>,
) -> ApiResult<Json<AuthResponse>> {
    let email = body.email.trim().to_lowercase();
    rate_limit::check_auth(&state, &headers, &email, AuthLimitKind::Login).await?;
    let user_model = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    if !password::verify(&body.password, &user_model.password_hash) {
        return Err(ApiError::Unauthorized);
    }

    let jti = Uuid::now_v7();
    let token = jwt::encode(
        user_model.id,
        jti,
        &state.config.jwt_secret,
        state.config.jwt_ttl_hours,
    )?;
    let token_hash = password::sha256_hex(&jti.to_string());

    let now = Utc::now();
    let session_row = session::ActiveModel {
        id: Set(jti),
        user_id: Set(user_model.id),
        token_hash: Set(token_hash),
        expires_at: Set((now + Duration::hours(state.config.jwt_ttl_hours)).fixed_offset()),
        created_at: Set(now.fixed_offset()),
        user_agent: Set(headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())),
        ip: Set(headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())),
    };
    session_row.insert(&state.db).await?;

    let mut user_view: UserView = user_model.clone().into();
    user_view.is_admin = user_view.is_admin || state.config.is_admin_email(&user_model.email);

    Ok(Json(AuthResponse {
        token,
        user: user_view,
    }))
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 200, body = OkResponse),
        (status = 401, description = "Missing or invalid token"),
    ),
    security(("bearerAuth" = [])),
    tag = "auth"
)]
pub async fn logout(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<OkResponse>> {
    session::Entity::delete_by_id(auth.session_id)
        .exec(&state.db)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    get,
    path = "/api/auth/me",
    responses(
        (status = 200, body = MeResponse),
        (status = 401, description = "Missing or invalid token"),
    ),
    security(("bearerAuth" = [])),
    tag = "auth"
)]
pub async fn me(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<MeResponse>> {
    let pid = personal_workspace_id(&state.db, auth.user.id).await?;
    let is_admin = auth.user.is_admin || state.config.is_admin_email(&auth.user.email);
    Ok(Json(MeResponse {
        id: auth.user.id,
        email: auth.user.email,
        is_admin,
        created_at: auth.user.created_at,
        personal_workspace_id: pid,
    }))
}
