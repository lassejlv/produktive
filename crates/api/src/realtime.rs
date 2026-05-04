use crate::{error::ApiError, state::AppState};
use chrono::{DateTime, FixedOffset, Utc};
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, Statement};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::broadcast;
use uuid::Uuid;

const REALTIME_BUFFER: usize = 1024;
const POSTGRES_CHANNEL: &str = "produktive_realtime";

#[derive(Clone)]
pub struct RealtimeBus {
    origin_id: String,
    sender: broadcast::Sender<RealtimeEvent>,
}

impl RealtimeBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(REALTIME_BUFFER);
        Self {
            origin_id: Uuid::new_v4().to_string(),
            sender,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<RealtimeEvent> {
        self.sender.subscribe()
    }

    pub async fn publish_workspace_event(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        entity: RealtimeEntity,
        action: RealtimeAction,
        entity_id: &str,
    ) {
        self.publish(db, organization_id, entity, action, entity_id, None)
            .await;
    }

    pub async fn publish_workspace_event_with_payload<T: Serialize>(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        entity: RealtimeEntity,
        action: RealtimeAction,
        entity_id: &str,
        payload: &T,
    ) {
        let payload = match serde_json::to_value(payload) {
            Ok(payload) => Some(payload),
            Err(error) => {
                tracing::warn!(%error, entity = ?entity, entity_id, "failed to serialize realtime payload");
                None
            }
        };

        self.publish(db, organization_id, entity, action, entity_id, payload)
            .await;
    }

    pub async fn publish_user_event_with_payload<T: Serialize>(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        user_id: &str,
        entity: RealtimeEntity,
        action: RealtimeAction,
        entity_id: &str,
        payload: &T,
    ) {
        let payload = match serde_json::to_value(payload) {
            Ok(payload) => Some(payload),
            Err(error) => {
                tracing::warn!(%error, entity = ?entity, entity_id, user_id, "failed to serialize realtime user payload");
                None
            }
        };

        self.publish_for_user(
            db,
            organization_id,
            Some(user_id.to_owned()),
            entity,
            action,
            entity_id,
            payload,
        )
        .await;
    }

    async fn publish(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        entity: RealtimeEntity,
        action: RealtimeAction,
        entity_id: &str,
        payload: Option<Value>,
    ) {
        self.publish_for_user(
            db,
            organization_id,
            None,
            entity,
            action,
            entity_id,
            payload,
        )
        .await;
    }

    async fn publish_for_user(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        user_id: Option<String>,
        entity: RealtimeEntity,
        action: RealtimeAction,
        entity_id: &str,
        payload: Option<Value>,
    ) {
        let event = RealtimeEvent {
            origin_id: self.origin_id.clone(),
            organization_id: organization_id.to_owned(),
            user_id,
            entity,
            action,
            entity_id: entity_id.to_owned(),
            payload,
            emitted_at: Utc::now().fixed_offset(),
        };

        self.publish_local(event.clone());

        if let Err(error) = publish_postgres(db, &event).await {
            tracing::warn!(%error, entity = ?event.entity, entity_id = %event.entity_id, "failed to publish realtime postgres notification");
        }
    }

    fn publish_local(&self, event: RealtimeEvent) {
        if let Err(error) = self.sender.send(event) {
            tracing::debug!(entity = ?error.0.entity, entity_id = %error.0.entity_id, "no realtime subscribers");
        }
    }

    fn is_local_origin(&self, origin_id: &str) -> bool {
        self.origin_id == origin_id
    }
}

impl Default for RealtimeBus {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeEvent {
    #[serde(default)]
    pub origin_id: String,
    pub organization_id: String,
    #[serde(default)]
    pub user_id: Option<String>,
    pub entity: RealtimeEntity,
    pub action: RealtimeAction,
    pub entity_id: String,
    #[serde(default)]
    pub payload: Option<Value>,
    pub emitted_at: DateTime<FixedOffset>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RealtimeEntity {
    Issue,
    Project,
    Label,
    Notification,
    Chat,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RealtimeAction {
    Created,
    Updated,
    Deleted,
}

impl RealtimeEvent {
    pub fn sse_data(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| self.entity_id.clone())
    }
}

async fn publish_postgres(db: &DatabaseConnection, event: &RealtimeEvent) -> Result<(), ApiError> {
    let payload = serde_json::to_string(event).map_err(|error| {
        ApiError::Internal(anyhow::anyhow!(
            "failed to serialize realtime event: {error}"
        ))
    })?;

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "SELECT pg_notify($1, $2)",
        [POSTGRES_CHANNEL.into(), payload.into()],
    ))
    .await?;

    Ok(())
}

pub fn spawn_postgres_listener(state: AppState) {
    tokio::spawn(async move {
        loop {
            if let Err(error) = listen_once(&state).await {
                tracing::warn!(%error, "realtime postgres listener stopped");
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn listen_once(state: &AppState) -> anyhow::Result<()> {
    let mut listener = sqlx::postgres::PgListener::connect(&state.config.database_url).await?;
    listener.listen(POSTGRES_CHANNEL).await?;
    tracing::info!(
        channel = POSTGRES_CHANNEL,
        "realtime postgres listener started"
    );

    loop {
        let notification = listener.recv().await?;
        match serde_json::from_str::<RealtimeEvent>(notification.payload()) {
            Ok(event) => {
                if !state.realtime.is_local_origin(&event.origin_id) {
                    state.realtime.publish_local(event);
                }
            }
            Err(error) => {
                tracing::warn!(%error, "failed to decode realtime postgres notification");
            }
        }
    }
}
