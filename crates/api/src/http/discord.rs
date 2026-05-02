use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{
    discord_link_state, discord_server_link, discord_user_link, member, organization,
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new().route("/link/{state}", get(preview_link).post(complete_link))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkPreviewResponse {
    guild_id: String,
    discord_user_id: String,
    expires_at: String,
    linked_organization: Option<LinkedOrganization>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompleteLinkRequest {
    organization_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteLinkResponse {
    ok: bool,
    organization: LinkedOrganization,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkedOrganization {
    id: String,
    name: String,
    slug: String,
}

async fn preview_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(state_value): Path<String>,
) -> Result<Json<LinkPreviewResponse>, ApiError> {
    require_auth(&headers, &state).await?;
    let row = find_pending_state(&state, &state_value).await?;
    let linked_server = discord_server_link::Entity::find()
        .filter(discord_server_link::Column::GuildId.eq(&row.guild_id))
        .one(&state.db)
        .await?;
    let linked_organization = if let Some(server) = linked_server {
        organization::Entity::find_by_id(&server.organization_id)
            .one(&state.db)
            .await?
    } else {
        None
    }
    .map(|org| LinkedOrganization {
        id: org.id,
        name: org.name,
        slug: org.slug,
    });
    Ok(Json(LinkPreviewResponse {
        guild_id: row.guild_id,
        discord_user_id: row.discord_user_id,
        expires_at: row.expires_at.to_rfc3339(),
        linked_organization,
    }))
}

async fn complete_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(state_value): Path<String>,
    Json(payload): Json<CompleteLinkRequest>,
) -> Result<Json<CompleteLinkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let link_state = find_pending_state(&state, &state_value).await?;
    let existing_server = discord_server_link::Entity::find()
        .filter(discord_server_link::Column::GuildId.eq(&link_state.guild_id))
        .one(&state.db)
        .await?;
    let target_organization_id = payload.organization_id;

    let membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::OrganizationId.eq(&target_organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Forbidden("You are not a member of that workspace".to_owned()))?;

    let changes_server_workspace = existing_server
        .as_ref()
        .map(|server| server.organization_id != target_organization_id)
        .unwrap_or(true);
    if changes_server_workspace && membership.role != "owner" {
        return Err(ApiError::Forbidden(
            "Only workspace owners can link Discord servers".to_owned(),
        ));
    }

    let org = organization::Entity::find_by_id(&target_organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_owned()))?;

    let now = Utc::now().fixed_offset();
    upsert_user_link(&state, &link_state.discord_user_id, &auth.user.id, now).await?;
    if changes_server_workspace {
        upsert_server_link(&state, &link_state.guild_id, &org.id, &auth.user.id, now).await?;
    }

    let mut active_state = link_state.into_active_model();
    active_state.consumed_at = Set(Some(now));
    active_state.update(&state.db).await?;

    Ok(Json(CompleteLinkResponse {
        ok: true,
        organization: LinkedOrganization {
            id: org.id,
            name: org.name,
            slug: org.slug,
        },
    }))
}

async fn find_pending_state(
    state: &AppState,
    state_value: &str,
) -> Result<discord_link_state::Model, ApiError> {
    let row = discord_link_state::Entity::find()
        .filter(discord_link_state::Column::State.eq(state_value))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Discord link expired".to_owned()))?;

    if row.consumed_at.is_some() || row.expires_at <= Utc::now().fixed_offset() {
        return Err(ApiError::BadRequest("Discord link expired".to_owned()));
    }

    Ok(row)
}

async fn upsert_user_link(
    state: &AppState,
    discord_user_id: &str,
    user_id: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<(), ApiError> {
    if let Some(row) = discord_user_link::Entity::find()
        .filter(discord_user_link::Column::DiscordUserId.eq(discord_user_id))
        .one(&state.db)
        .await?
    {
        let mut active = row.into_active_model();
        active.user_id = Set(user_id.to_owned());
        active.updated_at = Set(now);
        active.update(&state.db).await?;
        return Ok(());
    }

    discord_user_link::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        discord_user_id: Set(discord_user_id.to_owned()),
        user_id: Set(user_id.to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn upsert_server_link(
    state: &AppState,
    guild_id: &str,
    organization_id: &str,
    linked_by_id: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<(), ApiError> {
    if let Some(row) = discord_server_link::Entity::find()
        .filter(discord_server_link::Column::GuildId.eq(guild_id))
        .one(&state.db)
        .await?
    {
        let mut active = row.into_active_model();
        active.organization_id = Set(organization_id.to_owned());
        active.linked_by_id = Set(linked_by_id.to_owned());
        active.updated_at = Set(now);
        active.update(&state.db).await?;
        return Ok(());
    }

    discord_server_link::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        guild_id: Set(guild_id.to_owned()),
        organization_id: Set(organization_id.to_owned()),
        linked_by_id: Set(linked_by_id.to_owned()),
        agent_enabled: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}
