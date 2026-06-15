use std::{path::Path, sync::Arc};

use anyhow::{Context, Result};
use chrono::{DateTime, Datelike, FixedOffset, TimeZone, Timelike, Utc};
use duckdb::{params, Connection};
use futures_util::{StreamExt, TryStreamExt};
use object_store::{aws::AmazonS3Builder, path::Path as ObjectPath, ObjectStore};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone)]
pub struct LogStore {
    inner: Arc<LogStoreOptions>,
}

#[derive(Clone, Debug)]
pub struct LogStoreOptions {
    pub storage_uri: String,
    pub duckdb_path: Option<String>,
    pub s3_region: Option<String>,
    pub s3_endpoint: Option<String>,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,
}

#[derive(Clone, Debug)]
pub struct LogEvent {
    pub event_id: String,
    pub ts_ms: i64,
    pub received_at_ms: i64,
    pub level: String,
    pub message: String,
    pub service: Option<String>,
    pub environment: Option<String>,
    pub operation: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub source: String,
    pub event_json: String,
    pub fields_json: String,
}

#[derive(Clone, Debug)]
pub struct AppendBatch {
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub events: Vec<LogEvent>,
}

#[derive(Clone, Debug)]
pub struct SearchRequest {
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub from_ms: i64,
    pub to_ms: i64,
    pub limit: usize,
    pub query: Option<String>,
    pub level: Option<String>,
    pub service: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct SearchEvent {
    pub event_id: String,
    pub timestamp: DateTime<FixedOffset>,
    pub received_at: DateTime<FixedOffset>,
    pub level: String,
    pub message: String,
    pub service: Option<String>,
    pub environment: Option<String>,
    pub operation: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub source: String,
    #[schema(value_type = Object)]
    pub event: serde_json::Value,
    #[schema(value_type = Object)]
    pub fields: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct LogStorageInfo {
    pub storage_uri: String,
    pub backend: &'static str,
}

impl LogStore {
    pub fn new(options: LogStoreOptions) -> Result<Self> {
        let storage_uri = options.storage_uri.trim().trim_end_matches('/').to_owned();
        if storage_uri.is_empty() {
            anyhow::bail!("log storage URI must not be empty");
        }
        Ok(Self {
            inner: Arc::new(prepare_options(LogStoreOptions {
                storage_uri,
                ..options
            })?),
        })
    }

    pub fn info(&self) -> LogStorageInfo {
        LogStorageInfo {
            storage_uri: self.inner.storage_uri.clone(),
            backend: if is_s3_uri(&self.inner.storage_uri) {
                "s3"
            } else {
                "local"
            },
        }
    }

    pub async fn append(&self, batch: AppendBatch) -> Result<()> {
        self.append_with(None, batch).await
    }

    pub async fn append_with(
        &self,
        options: Option<LogStoreOptions>,
        batch: AppendBatch,
    ) -> Result<()> {
        if batch.events.is_empty() {
            return Ok(());
        }
        let config = self.options_or_default(options)?;
        tokio::task::spawn_blocking(move || append_blocking(&config, batch))
            .await
            .context("join log append worker")?
    }

    pub async fn search(&self, request: SearchRequest) -> Result<Vec<SearchEvent>> {
        self.search_with(None, request).await
    }

    pub async fn search_with(
        &self,
        options: Option<LogStoreOptions>,
        request: SearchRequest,
    ) -> Result<Vec<SearchEvent>> {
        let config = self.options_or_default(options)?;
        tokio::task::spawn_blocking(move || search_blocking(&config, request))
            .await
            .context("join log search worker")?
    }

    pub async fn delete_project_data_with(
        &self,
        options: Option<LogStoreOptions>,
        workspace_id: Uuid,
        project_id: Uuid,
    ) -> Result<usize> {
        let config = self.options_or_default(options)?;
        delete_project_data(&config, workspace_id, project_id).await
    }

    fn options_or_default(&self, options: Option<LogStoreOptions>) -> Result<LogStoreOptions> {
        match options {
            Some(options) => prepare_options(options),
            None => Ok((*self.inner).clone()),
        }
    }
}

fn prepare_options(options: LogStoreOptions) -> Result<LogStoreOptions> {
    let storage_uri = options.storage_uri.trim().trim_end_matches('/').to_owned();
    if storage_uri.is_empty() {
        anyhow::bail!("log storage URI must not be empty");
    }
    Ok(LogStoreOptions {
        storage_uri,
        ..options
    })
}

async fn delete_project_data(
    config: &LogStoreOptions,
    workspace_id: Uuid,
    project_id: Uuid,
) -> Result<usize> {
    let prefix = project_data_prefix(&config.storage_uri, workspace_id, project_id)?;
    if is_s3_uri(&config.storage_uri) {
        let store = s3_object_store(config)?;
        delete_object_prefix(store.as_ref(), prefix).await
    } else {
        let path = Path::new(&config.storage_uri)
            .join(format!("workspace_id={workspace_id}"))
            .join(format!("project_id={project_id}"));
        match tokio::fs::remove_dir_all(&path).await {
            Ok(()) => Ok(1),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(0),
            Err(error) => Err(error).with_context(|| format!("delete log project data {path:?}")),
        }
    }
}

async fn delete_object_prefix(store: &dyn ObjectStore, prefix: ObjectPath) -> Result<usize> {
    let objects = store.list(Some(&prefix));
    let paths = objects
        .map_ok(|meta| meta.location)
        .try_collect::<Vec<_>>()
        .await?;
    let count = paths.len();
    if count == 0 {
        return Ok(0);
    }
    let deletes = futures_util::stream::iter(paths.into_iter().map(Ok)).boxed();
    store.delete_stream(deletes).try_collect::<Vec<_>>().await?;
    Ok(count)
}

fn project_data_prefix(
    storage_uri: &str,
    workspace_id: Uuid,
    project_id: Uuid,
) -> Result<ObjectPath> {
    let base_path = if let Some(rest) = storage_uri.strip_prefix("s3://") {
        rest.split_once('/')
            .map(|(_, path)| path.trim_matches('/'))
            .filter(|path| !path.is_empty())
            .unwrap_or("")
            .to_string()
    } else {
        String::new()
    };
    let project_path = format!("workspace_id={workspace_id}/project_id={project_id}");
    let path = if base_path.is_empty() {
        project_path
    } else {
        format!("{base_path}/{project_path}")
    };
    Ok(ObjectPath::from(path))
}

fn s3_object_store(config: &LogStoreOptions) -> Result<Arc<dyn ObjectStore>> {
    let (bucket, _) = parse_s3_storage_uri(&config.storage_uri)?;
    let mut builder = AmazonS3Builder::new()
        .with_bucket_name(bucket)
        .with_virtual_hosted_style_request(true);
    if let Some(region) = config.s3_region.as_deref().filter(|v| !v.trim().is_empty()) {
        builder = builder.with_region(region.trim());
    }
    if let Some(endpoint) = config
        .s3_endpoint
        .as_deref()
        .filter(|v| !v.trim().is_empty())
    {
        let endpoint = normalize_s3_endpoint(endpoint);
        let scheme = if endpoint.use_ssl { "https" } else { "http" };
        builder = builder.with_endpoint(format!("{scheme}://{}", endpoint.host));
        if !endpoint.use_ssl {
            builder = builder.with_allow_http(true);
        }
    }
    if let (Some(access_key), Some(secret_key)) = (
        config.s3_access_key_id.as_deref(),
        config.s3_secret_access_key.as_deref(),
    ) {
        builder = builder
            .with_access_key_id(access_key)
            .with_secret_access_key(secret_key);
    }
    Ok(Arc::new(builder.build()?))
}

fn parse_s3_storage_uri(storage_uri: &str) -> Result<(&str, &str)> {
    let rest = storage_uri
        .strip_prefix("s3://")
        .context("S3 log storage URI must start with s3://")?;
    let (bucket, path) = rest.split_once('/').unwrap_or((rest, ""));
    if bucket.trim().is_empty() {
        anyhow::bail!("S3 log storage URI bucket is required");
    }
    Ok((bucket, path))
}

fn append_blocking(config: &LogStoreOptions, batch: AppendBatch) -> Result<()> {
    ensure_local_storage_dir(config)?;
    let conn = open_connection(config)?;
    configure_connection(&conn, config)?;
    conn.execute_batch(
        r#"
        CREATE TEMP TABLE log_batch (
            workspace_id VARCHAR,
            project_id VARCHAR,
            day VARCHAR,
            hour VARCHAR,
            event_id VARCHAR,
            ts_ms BIGINT,
            received_at_ms BIGINT,
            level VARCHAR,
            message VARCHAR,
            service VARCHAR,
            environment VARCHAR,
            operation VARCHAR,
            request_id VARCHAR,
            trace_id VARCHAR,
            source VARCHAR,
            event_json VARCHAR,
            fields_json VARCHAR
        );
        "#,
    )?;

    let mut insert = conn.prepare(
        r#"
        INSERT INTO log_batch VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        "#,
    )?;

    let workspace_id = batch.workspace_id.to_string();
    let project_id = batch.project_id.to_string();
    for event in batch.events {
        let ts = timestamp_from_ms(event.ts_ms)?;
        let day = format!("{:04}-{:02}-{:02}", ts.year(), ts.month(), ts.day());
        let hour = format!("{:02}", ts.hour());
        insert.execute(params![
            workspace_id,
            project_id,
            day,
            hour,
            event.event_id,
            event.ts_ms,
            event.received_at_ms,
            event.level,
            event.message,
            event.service,
            event.environment,
            event.operation,
            event.request_id,
            event.trace_id,
            event.source,
            event.event_json,
            event.fields_json,
        ])?;
    }
    drop(insert);

    let target = sql_string_literal(&config.storage_uri);
    conn.execute_batch(&format!(
        r#"
        COPY log_batch TO {target} (
            FORMAT parquet,
            PARTITION_BY (workspace_id, project_id, day, hour),
            OVERWRITE_OR_IGNORE,
            FILENAME_PATTERN 'part_{{uuid}}'
        );
        "#
    ))?;
    Ok(())
}

fn ensure_local_storage_dir(config: &LogStoreOptions) -> Result<()> {
    if is_s3_uri(&config.storage_uri) {
        return Ok(());
    }
    std::fs::create_dir_all(&config.storage_uri)
        .with_context(|| format!("create log storage directory {}", config.storage_uri))
}

fn search_blocking(config: &LogStoreOptions, request: SearchRequest) -> Result<Vec<SearchEvent>> {
    if !is_s3_uri(&config.storage_uri) {
        let project_dir = Path::new(&config.storage_uri)
            .join(format!("workspace_id={}", request.workspace_id))
            .join(format!("project_id={}", request.project_id));
        if !project_dir.exists() {
            return Ok(Vec::new());
        }
    }

    let conn = open_connection(config)?;
    configure_connection(&conn, config)?;

    let source = format!(
        "{}/workspace_id={}/project_id={}/*/*/*.parquet",
        config.storage_uri, request.workspace_id, request.project_id
    );
    let mut filters = vec![
        format!("ts_ms >= {}", request.from_ms),
        format!("ts_ms <= {}", request.to_ms),
    ];
    if let Some(level) = request
        .level
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        filters.push(format!(
            "lower(level) = lower({})",
            sql_string_literal(level)
        ));
    }
    if let Some(service) = request
        .service
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        filters.push(format!(
            "lower(service) = lower({})",
            sql_string_literal(service)
        ));
    }
    if let Some(query) = request
        .query
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let pattern = sql_like_contains(query);
        filters.push(format!(
            "(message ILIKE {pattern} ESCAPE '\\' OR event_json ILIKE {pattern} ESCAPE '\\' OR fields_json ILIKE {pattern} ESCAPE '\\')"
        ));
    }

    let sql = format!(
        r#"
        SELECT event_id,
               ts_ms,
               received_at_ms,
               level,
               message,
               service,
               environment,
               operation,
               request_id,
               trace_id,
               source,
               event_json,
               fields_json
        FROM read_parquet({}, hive_partitioning = true, union_by_name = true)
        WHERE {}
        ORDER BY ts_ms DESC
        LIMIT {}
        "#,
        sql_string_literal(&source),
        filters.join(" AND "),
        request.limit
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = match stmt.query_map([], |row| {
        let ts_ms: i64 = row.get(1)?;
        let received_at_ms: i64 = row.get(2)?;
        let event_json: String = row.get(11)?;
        let fields_json: String = row.get(12)?;
        Ok(SearchEvent {
            event_id: row.get(0)?,
            timestamp: timestamp_from_ms(ts_ms).unwrap_or_else(|_| epoch()),
            received_at: timestamp_from_ms(received_at_ms).unwrap_or_else(|_| epoch()),
            level: row.get(3)?,
            message: row.get(4)?,
            service: row.get(5)?,
            environment: row.get(6)?,
            operation: row.get(7)?,
            request_id: row.get(8)?,
            trace_id: row.get(9)?,
            source: row.get(10)?,
            event: serde_json::from_str(&event_json).unwrap_or(serde_json::Value::Null),
            fields: serde_json::from_str(&fields_json).unwrap_or(serde_json::Value::Null),
        })
    }) {
        Ok(rows) => rows,
        Err(error) if looks_like_no_parquet_files(&error) => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };

    rows.collect::<duckdb::Result<Vec<_>>>()
        .map_err(anyhow::Error::from)
}

fn open_connection(config: &LogStoreOptions) -> Result<Connection> {
    if let Some(path) = &config.duckdb_path {
        Connection::open(path).map_err(anyhow::Error::from)
    } else {
        Connection::open_in_memory().map_err(anyhow::Error::from)
    }
}

fn configure_connection(conn: &Connection, config: &LogStoreOptions) -> Result<()> {
    if !is_s3_uri(&config.storage_uri) {
        return Ok(());
    }

    conn.execute_batch("INSTALL httpfs; LOAD httpfs;")?;
    if let (Some(access_key), Some(secret_key)) = (
        config.s3_access_key_id.as_deref(),
        config.s3_secret_access_key.as_deref(),
    ) {
        let mut parts = vec![
            "TYPE s3".to_string(),
            format!("KEY_ID {}", sql_string_literal(access_key)),
            format!("SECRET {}", sql_string_literal(secret_key)),
        ];
        if let Some(region) = config.s3_region.as_deref() {
            parts.push(format!("REGION {}", sql_string_literal(region)));
        }
        if let Some(endpoint) = config.s3_endpoint.as_deref() {
            let endpoint = normalize_s3_endpoint(endpoint);
            parts.push(format!("ENDPOINT {}", sql_string_literal(&endpoint.host)));
            parts.push("URL_STYLE 'vhost'".to_string());
            if !endpoint.use_ssl {
                parts.push("USE_SSL false".to_string());
            }
        }
        conn.execute_batch(&format!(
            "CREATE OR REPLACE SECRET produktive_logs ({});",
            parts.join(", ")
        ))?;
    } else {
        conn.execute_batch(
            "CREATE OR REPLACE SECRET produktive_logs (TYPE s3, PROVIDER credential_chain);",
        )?;
    }
    Ok(())
}

fn timestamp_from_ms(ms: i64) -> Result<DateTime<FixedOffset>> {
    let secs = ms.div_euclid(1000);
    let nanos = (ms.rem_euclid(1000) as u32) * 1_000_000;
    Utc.timestamp_opt(secs, nanos)
        .single()
        .map(|dt| dt.fixed_offset())
        .context("invalid log timestamp")
}

fn epoch() -> DateTime<FixedOffset> {
    Utc.timestamp_opt(0, 0).single().unwrap().fixed_offset()
}

fn is_s3_uri(uri: &str) -> bool {
    uri.starts_with("s3://")
}

struct S3Endpoint {
    host: String,
    use_ssl: bool,
}

fn normalize_s3_endpoint(endpoint: &str) -> S3Endpoint {
    let endpoint = endpoint.trim().trim_end_matches('/');
    if let Some(rest) = endpoint.strip_prefix("https://") {
        return S3Endpoint {
            host: rest.split('/').next().unwrap_or(rest).to_string(),
            use_ssl: true,
        };
    }
    if let Some(rest) = endpoint.strip_prefix("http://") {
        return S3Endpoint {
            host: rest.split('/').next().unwrap_or(rest).to_string(),
            use_ssl: false,
        };
    }
    S3Endpoint {
        host: endpoint.split('/').next().unwrap_or(endpoint).to_string(),
        use_ssl: true,
    }
}

fn sql_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn sql_like_contains(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
        .replace('\'', "''");
    format!("'%{escaped}%'")
}

fn looks_like_no_parquet_files(error: &duckdb::Error) -> bool {
    let message = error.to_string().to_ascii_lowercase();
    message.contains("no files found") || message.contains("cannot open file")
}

#[cfg(test)]
mod tests {
    use super::{LogStore, LogStoreOptions};
    use uuid::Uuid;

    #[test]
    fn log_store_new_does_not_create_local_storage_directory() {
        let path = std::env::temp_dir().join(format!("produktive-log-store-{}", Uuid::now_v7()));
        let _ = std::fs::remove_dir_all(&path);

        let store = LogStore::new(LogStoreOptions {
            storage_uri: path.display().to_string(),
            duckdb_path: None,
            s3_region: None,
            s3_endpoint: None,
            s3_access_key_id: None,
            s3_secret_access_key: None,
        })
        .expect("log store construction should not touch local storage");

        assert!(!path.exists());
        drop(store);
        let _ = std::fs::remove_dir_all(path);
    }
}
