use crate::{
    auth::require_auth,
    error::ApiError,
    realtime::{RealtimeAction, RealtimeEntity},
    state::AppState,
};
use async_stream::stream;
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Router,
};
use produktive_entity::issue;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Deserialize;
use std::convert::Infallible;
use tokio::sync::broadcast;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(realtime))
}

#[derive(Deserialize)]
struct RealtimeQuery {
    channel: String,
    entity: Option<String>,
    id: Option<String>,
}

async fn realtime(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RealtimeQuery>,
) -> Result<Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    if query.channel != "workspace" && query.channel != "issueSystem" {
        return Err(ApiError::BadRequest(
            "Unsupported realtime channel".to_owned(),
        ));
    }

    let entity_filter = realtime_entity_filter(&query)?;
    let entity_id = query.id.clone();

    if entity_id.is_some() && entity_filter.is_none() {
        return Err(ApiError::BadRequest(
            "Realtime id filters require an entity".to_owned(),
        ));
    }

    if entity_filter == Some(RealtimeEntity::Issue) {
        if let Some(id) = &entity_id {
            validate_issue_subscription(&state, &auth.organization.id, id).await?;
        }
    }

    let org_id = auth.organization.id;
    let user_id = auth.user.id;
    let mut receiver = state.realtime.subscribe();

    let updates = stream! {
        yield Ok(Event::default().event("ready").data("subscribed"));

        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if event.organization_id != org_id {
                        continue;
                    }
                    if event.user_id.as_deref().is_some_and(|id| id != user_id) {
                        continue;
                    }
                    if entity_filter.as_ref().is_some_and(|entity| entity != &event.entity) {
                        continue;
                    }
                    if entity_id.as_deref().is_some_and(|id| id != event.entity_id) {
                        continue;
                    }

                    yield Ok(Event::default().event("workspace").data(event.sse_data()));

                    if event.action == RealtimeAction::Deleted && entity_id.is_some() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "realtime subscriber lagged");
                    yield Ok(Event::default().event("syncRequired").data("lagged"));
                }
                Err(broadcast::error::RecvError::Closed) => {
                    yield Ok(Event::default().event("error").data("realtime closed"));
                    break;
                }
            }
        }
    };

    Ok(Sse::new(updates).keep_alive(KeepAlive::default()))
}

fn realtime_entity_filter(query: &RealtimeQuery) -> Result<Option<RealtimeEntity>, ApiError> {
    if query.channel == "issueSystem" {
        return Ok(Some(RealtimeEntity::Issue));
    }

    match query.entity.as_deref() {
        Some("issue") => Ok(Some(RealtimeEntity::Issue)),
        Some("project") => Ok(Some(RealtimeEntity::Project)),
        Some("label") => Ok(Some(RealtimeEntity::Label)),
        Some("notification") => Ok(Some(RealtimeEntity::Notification)),
        Some(_) => Err(ApiError::BadRequest(
            "Unsupported realtime entity".to_owned(),
        )),
        None => Ok(None),
    }
}

async fn validate_issue_subscription(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<(), ApiError> {
    issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .filter(issue::Column::Id.eq(id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))?;

    Ok(())
}
