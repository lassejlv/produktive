use crate::{
    auth::{require_auth, require_workspace_owner},
    error::ApiError,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get},
    Json, Router,
};
use chrono::{Duration, Utc};
use produktive_entity::mcp_api_key;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use unkey_rs::{
    models::{CreateKeyRequest as UnkeyCreateKeyRequest, KeyIdRequest, Metadata, UpdateKeyRequest},
    UnkeyError,
};
use uuid::Uuid;

const TOKEN_PREFIX: &str = "pk_api";
const DEFAULT_EXPIRES_IN_DAYS: i64 = 365;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/keys", get(list_keys).post(create_key))
        .route("/keys/{id}", delete(revoke_key))
        .route("/keys/{id}/delete", delete(delete_key).post(delete_key))
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
    require_workspace_owner(
        &state.db,
        &auth.user.id,
        &auth.organization.id,
        "Only workspace owners can manage API keys",
    )
    .await?;
    let keys = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::ActiveOrganizationId.eq(&auth.organization.id))
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
            require_workspace_owner(
                &state.db,
                &auth.user.id,
                &id,
                "Only workspace owners can create API keys",
            )
            .await?;
            Some(id)
        }
        _ => Some(auth.organization.id.clone()),
    };
    require_workspace_owner(
        &state.db,
        &auth.user.id,
        organization_id.as_deref().unwrap_or(&auth.organization.id),
        "Only workspace owners can create API keys",
    )
    .await?;
    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("API key")
        .chars()
        .take(80)
        .collect::<String>();
    let expires_in_days = payload
        .expires_in_days
        .unwrap_or(DEFAULT_EXPIRES_IN_DAYS)
        .clamp(1, 3650);
    let expires_at = (Utc::now() + Duration::days(expires_in_days)).fixed_offset();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().fixed_offset();
    let unkey_key = state
        .unkey
        .keys()
        .create_key(UnkeyCreateKeyRequest {
            api_id: state.config.unkey_api_id.clone(),
            prefix: Some(TOKEN_PREFIX.to_owned()),
            name: Some(name.clone()),
            external_id: Some(auth.user.id.clone()),
            meta: key_metadata(&id, &auth.user.id, organization_id.as_deref(), "api"),
            expires: Some(expires_at.timestamp_millis()),
            enabled: Some(true),
            ..Default::default()
        })
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to create Unkey API key");
            ApiError::Internal(anyhow::anyhow!("failed to create API key"))
        })?
        .data;
    let token = unkey_key.key;
    let token_prefix = display_prefix(&token);

    let row = match (mcp_api_key::ActiveModel {
        id: Set(id),
        user_id: Set(auth.user.id),
        token_hash: Set(hash_token(&token)),
        token_prefix: Set(token_prefix),
        unkey_key_id: Set(Some(unkey_key.key_id.clone())),
        name: Set(name),
        active_organization_id: Set(organization_id),
        last_used_at: Set(None),
        revoked_at: Set(None),
        expires_at: Set(Some(expires_at)),
        unkey_migrated_at: Set(None),
        unkey_synced_at: Set(Some(now)),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .insert(&state.db)
    .await
    {
        Ok(row) => row,
        Err(error) => {
            if let Err(disable_error) = state
                .unkey
                .keys()
                .update_key(UpdateKeyRequest {
                    key_id: unkey_key.key_id.clone(),
                    enabled: Some(false),
                    ..Default::default()
                })
                .await
            {
                tracing::error!(
                    %disable_error,
                    unkey_key_id = %unkey_key.key_id,
                    "failed to disable orphaned Unkey API key after local insert failure"
                );
            }
            return Err(error.into());
        }
    };

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
    require_workspace_owner(
        &state.db,
        &auth.user.id,
        &auth.organization.id,
        "Only workspace owners can revoke API keys",
    )
    .await?;
    let key = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::Id.eq(id))
        .filter(mcp_api_key::Column::ActiveOrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("API key not found".to_owned()))?;

    if let Some(unkey_key_id) = key.unkey_key_id.as_deref() {
        state
            .unkey
            .keys()
            .update_key(UpdateKeyRequest {
                key_id: unkey_key_id.to_owned(),
                enabled: Some(false),
                ..Default::default()
            })
            .await
            .map_err(|error| {
                tracing::error!(%error, unkey_key_id, "failed to disable Unkey API key");
                ApiError::Internal(anyhow::anyhow!("failed to revoke API key"))
            })?;
    }

    let now = Utc::now().fixed_offset();
    let mut active = key.into_active_model();
    active.revoked_at = Set(Some(now));
    active.updated_at = Set(now);
    active.unkey_synced_at = Set(Some(now));
    active.update(&state.db).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn delete_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_workspace_owner(
        &state.db,
        &auth.user.id,
        &auth.organization.id,
        "Only workspace owners can delete API keys",
    )
    .await?;
    let key = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::Id.eq(id))
        .filter(mcp_api_key::Column::ActiveOrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("API key not found".to_owned()))?;

    if let Some(unkey_key_id) = key.unkey_key_id.as_deref() {
        match state
            .unkey
            .keys()
            .delete_key(KeyIdRequest {
                key_id: unkey_key_id.to_owned(),
            })
            .await
        {
            Ok(_) => {}
            Err(UnkeyError::Api(error)) if error.status == StatusCode::NOT_FOUND => {
                tracing::warn!(
                    unkey_key_id,
                    "Unkey API key was already missing while deleting local API key"
                );
            }
            Err(error) => {
                tracing::error!(%error, unkey_key_id, "failed to delete Unkey API key");
                return Err(ApiError::Internal(anyhow::anyhow!(
                    "failed to delete API key"
                )));
            }
        }
    }

    mcp_api_key::Entity::delete_by_id(key.id)
        .exec(&state.db)
        .await?;

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

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn display_prefix(token: &str) -> String {
    token.chars().take(22).collect()
}

fn key_metadata(
    local_key_id: &str,
    user_id: &str,
    organization_id: Option<&str>,
    token_kind: &str,
) -> Metadata {
    let mut meta: HashMap<String, Value> = HashMap::new();
    meta.insert("local_key_id".to_owned(), json!(local_key_id));
    meta.insert("user_id".to_owned(), json!(user_id));
    meta.insert("token_kind".to_owned(), json!(token_kind));
    if let Some(organization_id) = organization_id {
        meta.insert("organization_id".to_owned(), json!(organization_id));
    }
    meta
}
