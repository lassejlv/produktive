use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get},
    Json, Router,
};
use chrono::{Duration, Utc};
use produktive_entity::mcp_api_key;
use rand_core::{OsRng, RngCore};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const TOKEN_PREFIX: &str = "pk_mcp";
const DEFAULT_EXPIRES_IN_DAYS: i64 = 365;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/keys", get(list_keys).post(create_key))
        .route("/keys/{id}", delete(revoke_key))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeysEnvelope {
    keys: Vec<KeyResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeyEnvelope {
    key: KeyResponse,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeyResponse {
    id: String,
    name: String,
    token_prefix: String,
    active_organization_id: Option<String>,
    last_used_at: Option<String>,
    expires_at: Option<String>,
    revoked_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateKeyRequest {
    name: Option<String>,
    organization_id: Option<String>,
    expires_in_days: Option<i64>,
}

async fn list_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<KeysEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let keys = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::UserId.eq(&auth.user.id))
        .order_by_desc(mcp_api_key::Column::CreatedAt)
        .all(&state.db)
        .await?;

    Ok(Json(KeysEnvelope {
        keys: keys.into_iter().map(key_response).collect(),
    }))
}

async fn create_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateKeyRequest>,
) -> Result<(StatusCode, Json<KeyEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let organization_id = match payload.organization_id {
        Some(id) if !id.trim().is_empty() => {
            let id = id.trim().to_owned();
            if !crate::auth::user_is_member(&state.db, &auth.user.id, &id).await? {
                return Err(ApiError::Forbidden("Not a member of workspace".to_owned()));
            }
            Some(id)
        }
        _ => Some(auth.organization.id.clone()),
    };
    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("MCP key")
        .chars()
        .take(80)
        .collect::<String>();
    let expires_in_days = payload
        .expires_in_days
        .unwrap_or(DEFAULT_EXPIRES_IN_DAYS)
        .clamp(1, 3650);
    let expires_at = (Utc::now() + Duration::days(expires_in_days)).fixed_offset();
    let id = Uuid::new_v4().to_string();
    let token = generate_token(&id);
    let token_prefix = display_prefix(&token);
    let now = Utc::now().fixed_offset();

    let row = mcp_api_key::ActiveModel {
        id: Set(id),
        user_id: Set(auth.user.id),
        token_hash: Set(hash_token(&token)),
        token_prefix: Set(token_prefix),
        name: Set(name),
        active_organization_id: Set(organization_id),
        last_used_at: Set(None),
        revoked_at: Set(None),
        expires_at: Set(Some(expires_at)),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(KeyEnvelope {
            key: key_response(row),
            token,
        }),
    ))
}

async fn revoke_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let key = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::Id.eq(id))
        .filter(mcp_api_key::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("MCP key not found".to_owned()))?;

    let now = Utc::now().fixed_offset();
    let mut active = key.into_active_model();
    active.revoked_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(&state.db).await?;

    Ok(StatusCode::NO_CONTENT)
}

fn key_response(key: mcp_api_key::Model) -> KeyResponse {
    KeyResponse {
        id: key.id,
        name: key.name,
        token_prefix: key.token_prefix,
        active_organization_id: key.active_organization_id,
        last_used_at: key.last_used_at.map(|value| value.to_rfc3339()),
        expires_at: key.expires_at.map(|value| value.to_rfc3339()),
        revoked_at: key.revoked_at.map(|value| value.to_rfc3339()),
        created_at: key.created_at.to_rfc3339(),
        updated_at: key.updated_at.to_rfc3339(),
    }
}

fn generate_token(id: &str) -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    format!("{TOKEN_PREFIX}_{id}_{}", hex::encode(bytes))
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn display_prefix(token: &str) -> String {
    token.chars().take(22).collect()
}
