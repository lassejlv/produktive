use crate::{
    auth::require_auth,
    error::ApiError,
    realtime::{RealtimeAction, RealtimeEntity},
    state::AppState,
};
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Query, State},
    http::HeaderMap,
    response::Response,
    routing::get,
    Router,
};
use produktive_entity::issue;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Deserialize;
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
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RealtimeQuery>,
) -> Result<Response, ApiError> {
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

    Ok(ws.on_upgrade(move |socket| async move {
        realtime_socket(
            socket,
            org_id,
            user_id,
            entity_filter,
            entity_id,
            &mut receiver,
        )
        .await;
    }))
}

async fn realtime_socket(
    mut socket: WebSocket,
    org_id: String,
    user_id: String,
    entity_filter: Option<RealtimeEntity>,
    entity_id: Option<String>,
    receiver: &mut broadcast::Receiver<crate::realtime::RealtimeEvent>,
) {
    if socket
        .send(Message::Text(
            r#"{"type":"ready","data":"subscribed"}"#.into(),
        ))
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        tracing::debug!(%error, "realtime websocket receive failed");
                        break;
                    }
                }
            }
            update = receiver.recv() => {
                match update {
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

                        let should_close = event.action == RealtimeAction::Deleted && entity_id.is_some();
                        if socket.send(Message::Text(event.sse_data().into())).await.is_err() {
                            break;
                        }

                        if should_close {
                            let _ = socket.send(Message::Close(None)).await;
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::warn!(skipped, "realtime subscriber lagged");
                        if socket
                            .send(Message::Text(
                                r#"{"type":"syncRequired","reason":"lagged"}"#.into(),
                            ))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        let _ = socket
                            .send(Message::Text(
                                r#"{"type":"error","reason":"realtime closed"}"#.into(),
                            ))
                            .await;
                        break;
                    }
                }
            }
        }
    }
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
        Some("chat") => Ok(Some(RealtimeEntity::Chat)),
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
