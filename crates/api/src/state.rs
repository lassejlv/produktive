use crate::{config::Config, realtime::RealtimeBus};
use produktive_ai::AiClient;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as AsyncMutex;
use unkey_rs::Unkey;

pub type NoteWriteLock = Arc<AsyncMutex<()>>;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Config,
    pub ai: AiClient,
    pub unkey: Unkey,
    pub realtime: RealtimeBus,
    pub note_write_locks: Arc<Mutex<HashMap<String, NoteWriteLock>>>,
}

impl AppState {
    pub fn new(db: DatabaseConnection, config: Config, ai: AiClient, unkey: Unkey) -> Self {
        Self {
            db,
            config,
            ai,
            unkey,
            realtime: RealtimeBus::new(),
            note_write_locks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn note_write_lock(&self, note_id: &str) -> NoteWriteLock {
        let mut locks = self.note_write_locks.lock().expect("note_write_locks poisoned");
        locks
            .entry(note_id.to_owned())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }
}
