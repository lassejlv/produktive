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
use std::{convert::Infallible, time::Duration};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(realtime))
}

#[derive(Deserialize)]
struct RealtimeQuery {
    channel: String,
    id: String,
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

    let issue = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue::Column::Id.eq(&query.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))?;

    let issue_id = issue.id;
    let org_id = auth.organization.id;
    let db = state.db.clone();

    let updates = stream! {
        let mut last_seen = issue.updated_at.to_rfc3339();
        yield Ok(Event::default().event("ready").data(last_seen.clone()));

        loop {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let latest = issue::Entity::find()
                .filter(issue::Column::OrganizationId.eq(&org_id))
                .filter(issue::Column::Id.eq(&issue_id))
                .one(&db)
                .await;

            match latest {
                Ok(Some(issue)) => {
                    let updated = issue.updated_at.to_rfc3339();
                    if updated != last_seen {
                        last_seen = updated.clone();
                        yield Ok(Event::default().event("refresh").data(updated));
                    } else {
                        yield Ok(Event::default().event("tick").data(updated));
                    }
                }
                Ok(None) => {
                    yield Ok(Event::default().event("deleted").data(issue_id.clone()));
                    break;
                }
                Err(error) => {
                    tracing::warn!(%error, "issue realtime query failed");
                    yield Ok(Event::default().event("error").data("refresh failed"));
                }
            }
        }
    };

    Ok(Sse::new(updates).keep_alive(KeepAlive::default()))
}
