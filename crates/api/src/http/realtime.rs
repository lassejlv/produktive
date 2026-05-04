use crate::{auth::require_auth, error::ApiError, state::AppState};
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
    id: Option<String>,
}

async fn realtime(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RealtimeQuery>,
) -> Result<Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    if query.channel != "issueSystem" {
        return Err(ApiError::BadRequest(
            "Unsupported realtime channel".to_owned(),
        ));
    }

    let issue_id = query.id.clone();
    if let Some(id) = &issue_id {
        issue::Entity::find()
            .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
            .filter(issue::Column::Id.eq(id))
            .one(&state.db)
            .await?
            .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))?;
    }

    let org_id = auth.organization.id;
    let mut receiver = state.realtime.subscribe();

    let updates = stream! {
        yield Ok(Event::default().event("ready").data("subscribed"));

        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if event.organization_id != org_id {
                        continue;
                    }
                    if issue_id.as_deref().is_some_and(|id| id != event.issue_id) {
                        continue;
                    }

                    let name = event.sse_event_name();
                    let data = event.sse_data();
                    yield Ok(Event::default().event(name).data(data));

                    if name == "deleted" && issue_id.is_some() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "realtime subscriber lagged");
                    yield Ok(Event::default().event("refresh").data("lagged"));
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
