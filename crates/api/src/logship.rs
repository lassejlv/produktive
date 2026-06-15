//! Ships `WARN`/`ERROR` `tracing` events to a Produktive log project via the
//! `produktive-logs` SDK, so the API's own errors are durably searchable and
//! alertable instead of only hitting stdout. This is the API dogfooding the
//! Produktive logging product against itself.
//!
//! Wiring: built in [`crate::init_tracing`] from env and added as a
//! `tracing_subscriber` layer. Disabled (returns `None`) when
//! `PRODUKTIVE_LOG_TOKEN` is unset, exactly like the optional Redis/Polar
//! integrations — the rest of the system is unaffected.
//!
//! Design constraints (all load-bearing):
//! - `on_event` never blocks or does I/O. It builds a [`LogEvent`] and
//!   `try_send`s it onto a bounded channel, dropping on overflow — a logging
//!   sidecar must never apply backpressure to request handlers.
//! - A background task batches events and ships them with `ingest_batch`.
//! - Events from the SDK's own HTTP stack (`produktive_logs`, `reqwest`, …) are
//!   skipped, so a ship failure can't recursively generate more ship traffic.
//! - Internal failures report to stderr, never via `tracing`, which would
//!   recurse straight back into this layer.
//!
//! Self-ingest caveat: if `PRODUKTIVE_LOG_BASE_URL` points back at *this* API
//! process's own `/api/logs/ingest`, an unhealthy log backend can amplify — the
//! ingest handler logs its own write failure (and `tower_http` logs the 5xx),
//! each of which ships another event, and so on. The target-exclusion list
//! cannot break this (those are first-party `produktive_api`/`tower_http`
//! targets, which we must ship). Always ship to a *separate* log project or
//! instance, never the same process.

use std::any::Any;
use std::panic::PanicHookInfo;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use produktive_logs::{LogClient, LogEvent};
use serde_json::{Map, Value};
use tokio::sync::{mpsc, Notify};
use tokio::task::JoinHandle;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::{layer::Context, Layer};

/// Bounded buffer between `on_event` and the flush task. Full → events drop.
const CHANNEL_CAPACITY: usize = 1024;
/// Max events shipped in a single `ingest_batch` call.
const MAX_BATCH: usize = 100;
/// After the first event, wait this long to coalesce a burst into one batch.
const COALESCE_WINDOW: Duration = Duration::from_millis(250);

/// Targets whose events are never shipped, to break the feedback loop where
/// shipping a log failure would itself produce more logs to ship.
const EXCLUDED_TARGET_PREFIXES: &[&str] = &[
    "produktive_logs",
    "reqwest",
    "hyper",
    "hyper_util",
    "h2",
    "rustls",
    "tokio_util",
];

#[derive(Clone, Copy)]
enum MinLevel {
    Warn,
    Error,
}

impl MinLevel {
    /// Explicit match rather than `Ord` on `Level` — the direction of `Level`'s
    /// ordering is a common footgun, so we spell out exactly what ships.
    fn accepts(self, level: &Level) -> bool {
        match self {
            MinLevel::Error => *level == Level::ERROR,
            MinLevel::Warn => matches!(*level, Level::ERROR | Level::WARN),
        }
    }
}

/// A `tracing` layer that forwards qualifying events to Produktive.
pub struct ProduktiveLayer {
    tx: mpsc::Sender<LogEvent>,
    /// Per-event template carrying `service`/`environment`.
    defaults: LogEvent,
    min_level: MinLevel,
    dropped: Arc<AtomicU64>,
}

impl ProduktiveLayer {
    /// Build from env, or `None` when `PRODUKTIVE_LOG_TOKEN` is unset/blank.
    ///
    /// Spawns the background flush task, so it must run inside a Tokio runtime;
    /// if no runtime is present it degrades to disabled rather than panicking.
    /// The returned [`LogShipGuard`] should be held for the process lifetime and
    /// `shutdown()`-ed after the server stops to flush buffered events.
    pub fn from_env() -> Option<(Self, LogShipGuard)> {
        let token = env_opt("PRODUKTIVE_LOG_TOKEN")?;
        if tokio::runtime::Handle::try_current().is_err() {
            eprintln!("produktive log shipping disabled: no Tokio runtime");
            return None;
        }

        let mut builder = LogClient::builder().token(token);
        if let Some(base_url) = env_opt("PRODUKTIVE_LOG_BASE_URL") {
            builder = builder.base_url(base_url);
        }
        let client = match builder.build() {
            Ok(client) => client,
            Err(error) => {
                eprintln!("produktive log shipping disabled: {error}");
                return None;
            }
        };

        let service = env_opt("PRODUKTIVE_LOG_SERVICE").unwrap_or_else(|| "produktive-api".into());
        let mut defaults = LogEvent::new().service(service);
        if let Some(environment) = env_opt("PRODUKTIVE_LOG_ENVIRONMENT") {
            defaults = defaults.environment(environment);
        }
        let min_level = match env_opt("PRODUKTIVE_LOG_MIN_LEVEL")
            .map(|value| value.to_ascii_lowercase())
            .as_deref()
        {
            Some("error") => MinLevel::Error,
            _ => MinLevel::Warn,
        };

        let (tx, rx) = mpsc::channel(CHANNEL_CAPACITY);
        let dropped = Arc::new(AtomicU64::new(0));
        let shutdown = Arc::new(Notify::new());
        let handle = tokio::spawn(flush_loop(client, rx, Arc::clone(&shutdown)));

        Some((
            Self {
                tx,
                defaults,
                min_level,
                dropped,
            },
            LogShipGuard { shutdown, handle },
        ))
    }
}

/// Returned by [`ProduktiveLayer::from_env`]. Hold it for the process lifetime
/// and call [`LogShipGuard::shutdown`] after the server stops so the flush task
/// drains its buffer before exit.
pub struct LogShipGuard {
    shutdown: Arc<Notify>,
    handle: JoinHandle<()>,
}

impl LogShipGuard {
    /// Signal the flush task to ship remaining buffered events, waiting up to a
    /// few seconds. Without this, events buffered at exit (including a panic
    /// logged just before a crash) are best-effort and may be lost.
    pub async fn shutdown(self) {
        self.shutdown.notify_one();
        let _ = tokio::time::timeout(Duration::from_secs(3), self.handle).await;
    }
}

impl<S: Subscriber> Layer<S> for ProduktiveLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        if !self.min_level.accepts(meta.level()) {
            return;
        }
        let target = meta.target();
        if EXCLUDED_TARGET_PREFIXES
            .iter()
            .any(|prefix| target.starts_with(prefix))
        {
            return;
        }

        let mut visitor = FieldVisitor::default();
        event.record(&mut visitor);

        let level = if *meta.level() == Level::ERROR {
            "error"
        } else {
            "warn"
        };
        let mut log = self
            .defaults
            .clone()
            .level(level)
            .field("target", target)
            .timestamp_now();
        if let Some(message) = visitor.message {
            log = log.message(message);
        }
        if let Some(module) = meta.module_path() {
            log = log.field("module", module);
        }
        if let (Some(file), Some(line)) = (meta.file(), meta.line()) {
            log = log.field("source", format!("{file}:{line}"));
        }
        for (key, value) in visitor.fields {
            log = log.field(key, value);
        }

        if self.tx.try_send(log).is_err() {
            // Buffer full (or flush task gone): drop and occasionally surface the
            // loss to stderr. Never via tracing — that would recurse into here.
            let dropped = self.dropped.fetch_add(1, Ordering::Relaxed) + 1;
            if dropped % 1000 == 1 {
                eprintln!("produktive log shipping dropped {dropped} events (buffer full)");
            }
        }
    }
}

/// Install a process-wide panic hook that records panics through `tracing`
/// (and thus this layer) before delegating to the previous hook. Covers panics
/// in request handlers *and* background tasks; pair with `CatchPanicLayer` so
/// HTTP handler panics still return a 500.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info: &PanicHookInfo<'_>| {
        let location = info
            .location()
            .map(|loc| loc.to_string())
            .unwrap_or_default();
        tracing::error!(panic = %panic_message(info.payload()), location = %location, "panicked");
        previous(info);
    }));
}

fn panic_message(payload: &(dyn Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_owned()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_owned()
    }
}

fn env_opt(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

/// Collects an event's fields into a JSON map, pulling out the special
/// `message` field that `tracing` records for the event's format string.
#[derive(Default)]
struct FieldVisitor {
    message: Option<String>,
    fields: Map<String, Value>,
}

impl FieldVisitor {
    fn put(&mut self, field: &Field, value: Value) {
        if field.name() == "message" {
            self.message = Some(match value {
                Value::String(s) => s,
                other => other.to_string(),
            });
        } else {
            self.fields.insert(field.name().to_owned(), value);
        }
    }
}

impl Visit for FieldVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.put(field, Value::String(format!("{value:?}")));
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.put(field, Value::String(value.to_owned()));
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.put(field, Value::from(value));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.put(field, Value::from(value));
    }

    fn record_i128(&mut self, field: &Field, value: i128) {
        // serde_json represents 128-bit ints as numbers only when they fit; fall
        // back to a string for the (rare) out-of-range case.
        let value = serde_json::Number::from_i128(value)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.to_string()));
        self.put(field, value);
    }

    fn record_u128(&mut self, field: &Field, value: u128) {
        let value = serde_json::Number::from_u128(value)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.to_string()));
        self.put(field, value);
    }

    fn record_f64(&mut self, field: &Field, value: f64) {
        self.put(field, Value::from(value));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.put(field, Value::from(value));
    }

    fn record_error(&mut self, field: &Field, value: &(dyn std::error::Error + 'static)) {
        self.put(field, Value::String(value.to_string()));
    }
}

/// Drains the channel, coalescing bursts into batches shipped via the SDK.
/// Exits when `shutdown` fires or all senders drop, draining what remains first.
async fn flush_loop(client: LogClient, mut rx: mpsc::Receiver<LogEvent>, shutdown: Arc<Notify>) {
    'outer: loop {
        // Wait for the first event of a batch, or for shutdown.
        let first = tokio::select! {
            biased;
            _ = shutdown.notified() => break 'outer,
            maybe = rx.recv() => match maybe {
                Some(event) => event,
                None => break 'outer,
            },
        };

        let mut batch = Vec::with_capacity(MAX_BATCH);
        batch.push(first);

        // Coalesce a short burst. The window is brief (<=250ms), so we let it
        // finish even during shutdown — the next loop iteration sees the signal.
        let deadline = tokio::time::sleep(COALESCE_WINDOW);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                _ = &mut deadline => break,
                maybe = rx.recv() => match maybe {
                    Some(event) => {
                        batch.push(event);
                        if batch.len() >= MAX_BATCH {
                            break;
                        }
                    }
                    None => {
                        ship(&client, batch).await;
                        break 'outer;
                    }
                }
            }
        }

        ship(&client, batch).await;
    }

    // Drain anything still queued at shutdown / channel close.
    let mut rest = Vec::new();
    while let Ok(event) = rx.try_recv() {
        rest.push(event);
        if rest.len() >= MAX_BATCH {
            ship(&client, std::mem::take(&mut rest)).await;
        }
    }
    ship(&client, rest).await;
}

async fn ship(client: &LogClient, batch: Vec<LogEvent>) {
    if batch.is_empty() {
        return;
    }
    if let Err(error) = client.ingest_batch(batch).await {
        eprintln!("produktive log ship failed: {error}");
    }
}
