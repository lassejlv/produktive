use anyhow::{Context, Result};
use chrono::{FixedOffset, TimeZone, Utc};
use produktive_logging::{LogEvent, SearchEvent, SearchRequest};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone)]
pub struct LogHotCache {
    redis: redis::aio::ConnectionManager,
    ttl_seconds: usize,
    search_cache_ttl_seconds: usize,
    search_scan_limit: usize,
}

pub struct LogHotCacheOptions {
    pub url: String,
    pub ttl_seconds: usize,
    pub search_cache_ttl_seconds: usize,
    pub search_scan_limit: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CachedLogEvent {
    event_id: String,
    ts_ms: i64,
    received_at_ms: i64,
    level: String,
    message: String,
    service: Option<String>,
    environment: Option<String>,
    operation: Option<String>,
    request_id: Option<String>,
    trace_id: Option<String>,
    source: String,
    event_json: String,
    fields_json: String,
}

impl LogHotCache {
    pub async fn connect(options: LogHotCacheOptions) -> Result<Self> {
        let client = redis::Client::open(options.url.as_str()).context("open LOG_REDIS_URL")?;
        let redis = client
            .get_connection_manager()
            .await
            .context("connect LOG_REDIS_URL")?;
        Ok(Self {
            redis,
            ttl_seconds: options.ttl_seconds,
            search_cache_ttl_seconds: options.search_cache_ttl_seconds,
            search_scan_limit: options.search_scan_limit,
        })
    }

    pub async fn append(
        &self,
        workspace_id: Uuid,
        project_id: Uuid,
        events: &[LogEvent],
    ) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        let mut redis = self.redis.clone();
        let key = hot_key(workspace_id, project_id);
        let cutoff = Utc::now().timestamp_millis() - (self.ttl_seconds as i64 * 1000);
        let mut pipe = redis::pipe();
        for event in events {
            let cached = CachedLogEvent::from(event);
            pipe.cmd("ZADD")
                .arg(&key)
                .arg(cached.ts_ms)
                .arg(serde_json::to_string(&cached)?)
                .ignore();
        }
        pipe.cmd("ZREMRANGEBYSCORE")
            .arg(&key)
            .arg("-inf")
            .arg(cutoff)
            .ignore();
        pipe.cmd("EXPIRE").arg(&key).arg(self.ttl_seconds).ignore();
        let _: () = pipe.query_async(&mut redis).await?;
        Ok(())
    }

    pub async fn search(&self, request: &SearchRequest) -> Result<Option<Vec<SearchEvent>>> {
        if !self.can_answer_from_hot_window(request) {
            if let Some(cached) = self.cached_search_result(request).await? {
                return Ok(Some(cached));
            }
            return Ok(None);
        }

        let mut redis = self.redis.clone();
        let key = hot_key(request.workspace_id, request.project_id);
        let count: usize = redis::cmd("ZCOUNT")
            .arg(&key)
            .arg(request.from_ms)
            .arg(request.to_ms)
            .query_async(&mut redis)
            .await?;
        if count > self.search_scan_limit {
            return Ok(None);
        }

        let members: Vec<String> = redis::cmd("ZREVRANGEBYSCORE")
            .arg(&key)
            .arg(request.to_ms)
            .arg(request.from_ms)
            .query_async(&mut redis)
            .await?;

        let mut events = Vec::with_capacity(request.limit.min(members.len()));
        for member in members {
            let event: CachedLogEvent = serde_json::from_str(&member)?;
            if event.matches(request) {
                events.push(event.into_search_event());
                if events.len() >= request.limit {
                    break;
                }
            }
        }

        Ok(Some(events))
    }

    pub async fn cache_search_result(
        &self,
        request: &SearchRequest,
        events: &[SearchEvent],
    ) -> Result<()> {
        if self.search_cache_ttl_seconds == 0 {
            return Ok(());
        }
        if self.overlaps_hot_window(request) {
            return Ok(());
        }
        let mut redis = self.redis.clone();
        let key = search_key(request);
        let value = serde_json::to_string(events)?;
        let _: () = redis
            .set_ex(key, value, self.search_cache_ttl_seconds as u64)
            .await?;
        Ok(())
    }

    async fn cached_search_result(
        &self,
        request: &SearchRequest,
    ) -> Result<Option<Vec<SearchEvent>>> {
        if self.search_cache_ttl_seconds == 0 {
            return Ok(None);
        }
        let mut redis = self.redis.clone();
        let key = search_key(request);
        let value: Option<String> = redis.get(key).await?;
        match value {
            Some(value) => Ok(Some(serde_json::from_str(&value)?)),
            None => Ok(None),
        }
    }

    fn can_answer_from_hot_window(&self, request: &SearchRequest) -> bool {
        let cutoff = Utc::now().timestamp_millis() - (self.ttl_seconds as i64 * 1000);
        request.from_ms >= cutoff && request.to_ms >= request.from_ms
    }

    fn overlaps_hot_window(&self, request: &SearchRequest) -> bool {
        let cutoff = Utc::now().timestamp_millis() - (self.ttl_seconds as i64 * 1000);
        request.to_ms >= cutoff
    }
}

impl CachedLogEvent {
    fn matches(&self, request: &SearchRequest) -> bool {
        if let Some(level) = request
            .level
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if !self.level.eq_ignore_ascii_case(level) {
                return false;
            }
        }
        if let Some(service) = request
            .service
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if !self
                .service
                .as_deref()
                .is_some_and(|value| value.eq_ignore_ascii_case(service))
            {
                return false;
            }
        }
        if let Some(query) = request
            .query
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            let query = query.to_ascii_lowercase();
            let haystack = format!(
                "{}\n{}\n{}",
                self.message.to_ascii_lowercase(),
                self.event_json.to_ascii_lowercase(),
                self.fields_json.to_ascii_lowercase()
            );
            if !haystack.contains(&query) {
                return false;
            }
        }
        true
    }

    fn into_search_event(self) -> SearchEvent {
        SearchEvent {
            event_id: self.event_id,
            timestamp: timestamp_from_ms(self.ts_ms),
            received_at: timestamp_from_ms(self.received_at_ms),
            level: self.level,
            message: self.message,
            service: self.service,
            environment: self.environment,
            operation: self.operation,
            request_id: self.request_id,
            trace_id: self.trace_id,
            source: self.source,
            event: serde_json::from_str(&self.event_json).unwrap_or(serde_json::Value::Null),
            fields: serde_json::from_str(&self.fields_json).unwrap_or(serde_json::Value::Null),
        }
    }
}

impl From<&LogEvent> for CachedLogEvent {
    fn from(event: &LogEvent) -> Self {
        Self {
            event_id: event.event_id.clone(),
            ts_ms: event.ts_ms,
            received_at_ms: event.received_at_ms,
            level: event.level.clone(),
            message: event.message.clone(),
            service: event.service.clone(),
            environment: event.environment.clone(),
            operation: event.operation.clone(),
            request_id: event.request_id.clone(),
            trace_id: event.trace_id.clone(),
            source: event.source.clone(),
            event_json: event.event_json.clone(),
            fields_json: event.fields_json.clone(),
        }
    }
}

fn hot_key(workspace_id: Uuid, project_id: Uuid) -> String {
    format!("produktive:logs:hot:{workspace_id}:{project_id}")
}

fn search_key(request: &SearchRequest) -> String {
    let mut hasher = Sha256::new();
    hasher.update(request.workspace_id.as_bytes());
    hasher.update(request.project_id.as_bytes());
    hasher.update(request.from_ms.to_be_bytes());
    hasher.update(request.to_ms.to_be_bytes());
    hasher.update(request.limit.to_be_bytes());
    hasher.update(request.query.as_deref().unwrap_or("").as_bytes());
    hasher.update(request.level.as_deref().unwrap_or("").as_bytes());
    hasher.update(request.service.as_deref().unwrap_or("").as_bytes());
    format!(
        "produktive:logs:search:{}:{}:{:x}",
        request.workspace_id,
        request.project_id,
        hasher.finalize()
    )
}

fn timestamp_from_ms(ms: i64) -> chrono::DateTime<FixedOffset> {
    let secs = ms.div_euclid(1000);
    let nanos = (ms.rem_euclid(1000) as u32) * 1_000_000;
    Utc.timestamp_opt(secs, nanos)
        .single()
        .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap())
        .fixed_offset()
}

#[cfg(test)]
mod tests {
    use super::{hot_key, search_key, CachedLogEvent};
    use produktive_logging::{LogEvent, SearchRequest};
    use uuid::Uuid;

    #[test]
    fn hot_key_scopes_to_workspace_and_project() {
        let workspace_id = Uuid::now_v7();
        let project_id = Uuid::now_v7();
        assert_eq!(
            hot_key(workspace_id, project_id),
            format!("produktive:logs:hot:{workspace_id}:{project_id}")
        );
    }

    #[test]
    fn search_key_changes_with_filters() {
        let workspace_id = Uuid::now_v7();
        let project_id = Uuid::now_v7();
        let base = SearchRequest {
            workspace_id,
            project_id,
            from_ms: 1,
            to_ms: 2,
            limit: 100,
            query: None,
            level: None,
            service: None,
        };
        let mut filtered = base.clone();
        filtered.level = Some("error".to_string());
        assert_ne!(search_key(&base), search_key(&filtered));
    }

    #[test]
    fn cached_event_matches_filters() {
        let workspace_id = Uuid::now_v7();
        let project_id = Uuid::now_v7();
        let event = CachedLogEvent {
            event_id: "event-1".to_string(),
            ts_ms: 1000,
            received_at_ms: 1000,
            level: "error".to_string(),
            message: "checkout failed".to_string(),
            service: Some("api".to_string()),
            environment: Some("production".to_string()),
            operation: None,
            request_id: None,
            trace_id: None,
            source: "evlog".to_string(),
            event_json: r#"{"cart_id":"cart_123"}"#.to_string(),
            fields_json: r#"{"payment":"declined"}"#.to_string(),
        };

        let request = SearchRequest {
            workspace_id,
            project_id,
            from_ms: 0,
            to_ms: 2000,
            limit: 100,
            query: Some("declined".to_string()),
            level: Some("ERROR".to_string()),
            service: Some("API".to_string()),
        };

        assert!(event.matches(&request));
    }

    #[test]
    fn cached_event_round_trips_to_search_event() {
        let event = LogEvent {
            event_id: "event-1".to_string(),
            ts_ms: 1000,
            received_at_ms: 1100,
            level: "info".to_string(),
            message: "hello".to_string(),
            service: Some("api".to_string()),
            environment: None,
            operation: None,
            request_id: None,
            trace_id: None,
            source: "evlog".to_string(),
            event_json: r#"{"message":"hello"}"#.to_string(),
            fields_json: r#"{"message":"hello"}"#.to_string(),
        };

        let search = CachedLogEvent::from(&event).into_search_event();

        assert_eq!(search.event_id, "event-1");
        assert_eq!(search.timestamp.timestamp_millis(), 1000);
        assert_eq!(search.received_at.timestamp_millis(), 1100);
        assert_eq!(search.event["message"], "hello");
    }
}
