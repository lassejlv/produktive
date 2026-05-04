use crate::{error::ApiError, state::AppState};
use chrono::{DateTime, FixedOffset, Utc};
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, Statement};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::broadcast;

const REALTIME_BUFFER: usize = 1024;
const POSTGRES_CHANNEL: &str = "produktive_realtime";

#[derive(Clone)]
pub struct RealtimeBus {
    sender: broadcast::Sender<RealtimeEvent>,
}

impl RealtimeBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(REALTIME_BUFFER);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<RealtimeEvent> {
        self.sender.subscribe()
    }

    pub async fn issue_changed(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        issue_id: &str,
    ) {
        self.publish(
            db,
            organization_id,
            issue_id,
            RealtimeEventKind::IssueChanged,
        )
        .await;
    }

    pub async fn issue_deleted(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        issue_id: &str,
    ) {
        self.publish(
            db,
            organization_id,
            issue_id,
            RealtimeEventKind::IssueDeleted,
        )
        .await;
    }

    async fn publish(
        &self,
        db: &DatabaseConnection,
        organization_id: &str,
        issue_id: &str,
        kind: RealtimeEventKind,
    ) {
        let event = RealtimeEvent {
            organization_id: organization_id.to_owned(),
            issue_id: issue_id.to_owned(),
            kind,
            emitted_at: Utc::now().fixed_offset(),
        };

        self.publish_local(event.clone());

        if let Err(error) = publish_postgres(db, &event).await {
            tracing::warn!(%error, issue_id = %event.issue_id, "failed to publish realtime postgres notification");
        }
    }

    fn publish_local(&self, event: RealtimeEvent) {
        if let Err(error) = self.sender.send(event) {
            tracing::debug!(issue_id = %error.0.issue_id, "no realtime subscribers");
        }
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
    pub organization_id: String,
    pub issue_id: String,
    pub kind: RealtimeEventKind,
    pub emitted_at: DateTime<FixedOffset>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RealtimeEventKind {
    IssueChanged,
    IssueDeleted,
}

impl RealtimeEvent {
    pub fn sse_event_name(&self) -> &'static str {
        match self.kind {
            RealtimeEventKind::IssueChanged => "refresh",
            RealtimeEventKind::IssueDeleted => "deleted",
        }
    }

    pub fn sse_data(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| self.issue_id.clone())
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
            Ok(event) => state.realtime.publish_local(event),
            Err(error) => {
                tracing::warn!(%error, "failed to decode realtime postgres notification");
            }
        }
    }
}
