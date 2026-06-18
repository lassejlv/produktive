use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use uuid::Uuid;

/// How long a serialized status summary is reused before rebuilding.
pub const SUMMARY_TTL: Duration = Duration::from_secs(60);

/// HTTP `Cache-Control` max-age matching the in-process TTL.
pub const SUMMARY_CACHE_CONTROL: &str = "public, max-age=60";

#[derive(Clone, Default)]
pub struct StatusSummaryCache {
    entries: Arc<Mutex<HashMap<Uuid, CachedSummary>>>,
}

struct CachedSummary {
    body: Vec<u8>,
    fetched_at: Instant,
}

impl StatusSummaryCache {
    pub fn get(&self, workspace_id: Uuid) -> Option<Vec<u8>> {
        let cache = self.entries.lock().ok()?;
        let entry = cache.get(&workspace_id)?;
        if entry.fetched_at.elapsed() < SUMMARY_TTL {
            Some(entry.body.clone())
        } else {
            None
        }
    }

    pub fn put(&self, workspace_id: Uuid, body: Vec<u8>) {
        if let Ok(mut cache) = self.entries.lock() {
            cache.insert(
                workspace_id,
                CachedSummary {
                    body,
                    fetched_at: Instant::now(),
                },
            );
        }
    }
}
