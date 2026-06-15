use std::{sync::Arc, time::Duration};

use anyhow::{Context, Result};
use produktive_probe::ProbeSpec;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use uuid::Uuid;

#[derive(Clone)]
struct Config {
    region: String,
    control_plane_url: String,
    worker_token: String,
    concurrency: usize,
    poll_interval: Duration,
    heartbeat_interval: Duration,
    capabilities: Vec<String>,
}

#[derive(Serialize)]
struct HeartbeatBody<'a> {
    region_slug: &'a str,
    name: &'a str,
    version: &'a str,
    capabilities: &'a [String],
}

#[derive(Serialize)]
struct ClaimJobsBody<'a> {
    region_slug: &'a str,
    max_jobs: u64,
}

#[derive(Deserialize)]
struct ClaimJobsResponse {
    jobs: Vec<WorkerJob>,
}

#[derive(Deserialize)]
struct WorkerJob {
    lease_id: Uuid,
    max_body_bytes: usize,
    monitor: ProbeSpec,
}

#[derive(Serialize)]
struct SubmitResultBody {
    status: i16,
    latency_ms: Option<i32>,
    status_code: Option<i32>,
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    init_tracing();

    let config = Arc::new(Config::from_env()?);
    let client = Client::builder()
        .user_agent(format!("produktive-worker/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    let semaphore = Arc::new(Semaphore::new(config.concurrency));
    let mut heartbeat = tokio::time::interval(config.heartbeat_interval);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    send_heartbeat(&client, &config).await?;
    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                if let Err(error) = send_heartbeat(&client, &config).await {
                    tracing::warn!(error = ?error, "worker heartbeat failed");
                }
            }
            _ = tokio::time::sleep(config.poll_interval) => {
                let available = semaphore.available_permits();
                if available == 0 {
                    continue;
                }
                match claim_jobs(&client, &config, available as u64).await {
                    Ok(jobs) => {
                        for job in jobs {
                            let client = client.clone();
                            let config = config.clone();
                            let permit = semaphore.clone().acquire_owned().await?;
                            tokio::spawn(async move {
                                if let Err(error) = run_job(&client, &config, job).await {
                                    tracing::warn!(error = ?error, "worker job failed");
                                }
                                drop(permit);
                            });
                        }
                    }
                    Err(error) => tracing::warn!(error = ?error, "claim jobs failed"),
                }
            }
        }
    }
}

impl Config {
    fn from_env() -> Result<Self> {
        let region = required_env("WORKER_REGION")?.trim().to_lowercase();
        if region.is_empty() {
            anyhow::bail!("WORKER_REGION must not be empty");
        }
        let control_plane_url = required_env("CONTROL_PLANE_URL")?
            .trim()
            .trim_end_matches('/')
            .to_string();
        let worker_token = required_env("WORKER_TOKEN")?;
        let concurrency = optional_env("WORKER_CONCURRENCY")
            .unwrap_or_else(|| "16".into())
            .parse()
            .context("WORKER_CONCURRENCY must be usize")?;
        let poll_interval = Duration::from_millis(
            optional_env("WORKER_POLL_INTERVAL_MS")
                .unwrap_or_else(|| "1000".into())
                .parse()
                .context("WORKER_POLL_INTERVAL_MS must be u64")?,
        );
        let heartbeat_interval = Duration::from_secs(
            optional_env("WORKER_HEARTBEAT_SECONDS")
                .unwrap_or_else(|| "30".into())
                .parse()
                .context("WORKER_HEARTBEAT_SECONDS must be u64")?,
        );
        let capabilities = optional_env("WORKER_CAPABILITIES")
            .unwrap_or_else(|| "http,tcp,postgres,redis,ssh".into())
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_lowercase())
            .collect::<Vec<_>>();
        if capabilities.is_empty() {
            anyhow::bail!("WORKER_CAPABILITIES must include at least one capability");
        }
        Ok(Self {
            region,
            control_plane_url,
            worker_token,
            concurrency,
            poll_interval,
            heartbeat_interval,
            capabilities,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/internal/workers{}", self.control_plane_url, path)
    }
}

async fn send_heartbeat(client: &Client, config: &Config) -> Result<()> {
    let body = HeartbeatBody {
        region_slug: &config.region,
        name: &config.region,
        version: env!("CARGO_PKG_VERSION"),
        capabilities: &config.capabilities,
    };
    client
        .post(config.url("/heartbeat"))
        .bearer_auth(&config.worker_token)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;
    tracing::info!(region = %config.region, "worker heartbeat sent");
    Ok(())
}

async fn claim_jobs(client: &Client, config: &Config, max_jobs: u64) -> Result<Vec<WorkerJob>> {
    let body = ClaimJobsBody {
        region_slug: &config.region,
        max_jobs,
    };
    let response = client
        .post(config.url("/jobs/claim"))
        .bearer_auth(&config.worker_token)
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<ClaimJobsResponse>()
        .await?;
    Ok(response.jobs)
}

async fn run_job(client: &Client, config: &Config, job: WorkerJob) -> Result<()> {
    let outcome = produktive_probe::run(client, &job.monitor, job.max_body_bytes)
        .await
        .compact();
    let body = SubmitResultBody {
        status: outcome.status,
        latency_ms: outcome.latency_ms,
        status_code: outcome.status_code,
        error: outcome.error,
    };
    client
        .post(config.url(&format!("/jobs/{}/result", job.lease_id)))
        .bearer_auth(&config.worker_token)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;
    tracing::info!(
        region = %config.region,
        monitor_id = %job.monitor.id,
        status = body.status,
        "worker result submitted"
    );
    Ok(())
}

fn required_env(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("{name} not set"))
}

fn optional_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("produktive_worker=info,produktive_probe=info")),
        )
        .with(tracing_subscriber::fmt::layer().compact())
        .init();
}
