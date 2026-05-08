use crate::{error::ApiError, state::AppState};
use produktive_entity::{produktive_oauth_client, user};
use sea_orm::EntityTrait;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActorProfile {
    pub(crate) kind: String,
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) client_id: Option<String>,
}

pub(crate) async fn actor_profile_for_ids(
    state: &AppState,
    oauth_client_id: Option<&str>,
    user_id: Option<&str>,
) -> Result<Option<ActorProfile>, ApiError> {
    if let Some(id) = oauth_client_id {
        if let Some(profile) = oauth_client_actor_profile(state, id).await? {
            return Ok(Some(profile));
        }
    }

    match user_id {
        Some(id) => user_actor_profile(state, id).await,
        None => Ok(None),
    }
}

pub(crate) async fn user_actor_profile(
    state: &AppState,
    id: &str,
) -> Result<Option<ActorProfile>, ApiError> {
    Ok(user::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .map(|user| ActorProfile {
            kind: "user".to_owned(),
            id: user.id,
            name: user.name,
            image: user.image,
            client_id: None,
        }))
}

async fn oauth_client_actor_profile(
    state: &AppState,
    id: &str,
) -> Result<Option<ActorProfile>, ApiError> {
    Ok(produktive_oauth_client::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .map(|client| ActorProfile {
            kind: "agent".to_owned(),
            id: client.id,
            name: client.client_name,
            image: None,
            client_id: Some(client.client_id),
        }))
}
