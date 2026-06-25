use anyhow::{anyhow, Context, Result};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    /// Direct (non-pooled) connection — used for migrations.
    pub database_url: String,
    /// Pooled connection — used by the app at runtime. Falls back to `database_url` if unset.
    pub database_pooled_url: String,
    pub port: u16,
    pub jwt_secret: String,
    pub jwt_ttl_hours: i64,
    /// How long a password reset token is valid for, in minutes.
    pub password_reset_ttl_minutes: i64,
    pub scheduler_tick_ms: u64,
    pub scheduler_max_concurrent_checks: usize,
    pub scheduler_max_due_per_tick: u64,
    pub http_check_max_body_bytes: usize,
    pub redis_url: Option<String>,
    pub auth_rate_limit_login_per_minute: u32,
    pub auth_rate_limit_register_per_hour: u32,
    pub auth_rate_limit_register_global_per_hour: u32,
    pub auth_rate_limit_password_reset_per_hour: u32,
    pub auth_rate_limit_password_reset_global_per_hour: u32,
    pub cors_allowed_origins: Vec<String>,
    pub session_cleanup_tick_seconds: u64,
    pub custom_domain_cname_target: String,
    /// Cloudflare for SaaS (custom hostnames). All optional — when `cf_api_token`
    /// or `cf_zone_id` is absent the Cloudflare client is disabled and custom
    /// domains fall back to DNS-verification-only (the pre-Cloudflare path).
    pub cf_api_token: Option<String>,
    pub cf_zone_id: Option<String>,
    pub cf_base_url: Option<String>,
    pub cf_fallback_origin: Option<String>,
    /// Zone DCV-delegation UUID, used to render the `_acme-challenge` CNAME each
    /// customer adds for auto-renewing TXT DCV.
    pub cf_dcv_delegation_uuid: Option<String>,
    /// Directory containing the built web frontend (`index.html`, `assets/`, ...).
    /// When `None`, static-file serving is disabled.
    pub web_dist_dir: Option<PathBuf>,
    pub polar_secret_key: Option<String>,
    pub polar_base_url: Option<String>,
    pub polar_webhook_secret: Option<String>,
    /// How often the billing reconcile sweep re-reports gauge usage to Polar.
    pub billing_reconcile_tick_seconds: u64,
    /// Public app URL for billing checkout redirects (e.g. `http://localhost:5173`).
    pub app_url: Option<String>,
    pub github_client_id: Option<String>,
    pub github_client_secret: Option<String>,
    pub github_redirect_url: Option<String>,
    pub local_region_slug: String,
    pub api_local_worker_enabled: bool,
    pub worker_token: Option<String>,
    pub worker_tokens: BTreeMap<String, String>,
    pub worker_lease_seconds: u64,
    /// Base URL of the Grafana Loki HTTP endpoint for log storage (e.g.
    /// `http://loki-railway.railway.internal:3100`). When unset, log storage is
    /// disabled.
    pub loki_url: Option<String>,
    /// Optional Loki tenant; sent as the `X-Scope-OrgID` header on every
    /// request. Unset when Loki has `auth_enabled = false` (the common case).
    pub loki_tenant: Option<String>,
    /// Enables private-preview deployment routes. Access is still workspace
    /// approved server-side.
    pub deployments_enabled: bool,
    /// Hex-encoded 32-byte key used to encrypt deployment registry credentials
    /// and runtime secrets.
    pub deploy_secrets_key: Option<String>,
    pub deploy_max_services_per_workspace: i64,
    pub deploy_max_active_deployments_per_workspace: i64,
    /// Optional Fly API token used to fetch platform region metadata.
    pub fly_api_token: Option<String>,
    /// Fly Machines API base URL (defaults to https://api.machines.dev).
    pub fly_api_hostname: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL not set")?;
        let database_pooled_url =
            std::env::var("DATABASE_POOLED_URL").unwrap_or_else(|_| database_url.clone());
        let port = std::env::var("PORT")
            .unwrap_or_else(|_| "3000".into())
            .parse()
            .context("PORT must be u16")?;
        let jwt_secret = std::env::var("JWT_SECRET").context("JWT_SECRET not set")?;
        if jwt_secret.len() < 32 {
            return Err(anyhow!("JWT_SECRET must be at least 32 characters"));
        }
        let jwt_ttl_hours = std::env::var("JWT_TTL_HOURS")
            .unwrap_or_else(|_| "720".into())
            .parse()
            .context("JWT_TTL_HOURS must be i64")?;
        let password_reset_ttl_minutes = std::env::var("PASSWORD_RESET_TTL_MINUTES")
            .unwrap_or_else(|_| "60".into())
            .parse()
            .context("PASSWORD_RESET_TTL_MINUTES must be i64")?;
        if password_reset_ttl_minutes < 1 {
            return Err(anyhow!("PASSWORD_RESET_TTL_MINUTES must be at least 1"));
        }
        let scheduler_tick_ms = std::env::var("SCHEDULER_TICK_MS")
            .unwrap_or_else(|_| "5000".into())
            .parse()
            .context("SCHEDULER_TICK_MS must be u64")?;
        let scheduler_max_concurrent_checks = std::env::var("SCHEDULER_MAX_CONCURRENT_CHECKS")
            .unwrap_or_else(|_| "32".into())
            .parse()
            .context("SCHEDULER_MAX_CONCURRENT_CHECKS must be usize")?;
        if scheduler_max_concurrent_checks == 0 {
            return Err(anyhow!(
                "SCHEDULER_MAX_CONCURRENT_CHECKS must be at least 1"
            ));
        }
        let scheduler_max_due_per_tick = std::env::var("SCHEDULER_MAX_DUE_PER_TICK")
            .unwrap_or_else(|_| "100".into())
            .parse()
            .context("SCHEDULER_MAX_DUE_PER_TICK must be u64")?;
        if scheduler_max_due_per_tick == 0 {
            return Err(anyhow!("SCHEDULER_MAX_DUE_PER_TICK must be at least 1"));
        }
        let http_check_max_body_bytes = std::env::var("HTTP_CHECK_MAX_BODY_BYTES")
            .unwrap_or_else(|_| "1048576".into())
            .parse()
            .context("HTTP_CHECK_MAX_BODY_BYTES must be usize")?;
        if http_check_max_body_bytes == 0 {
            return Err(anyhow!("HTTP_CHECK_MAX_BODY_BYTES must be at least 1"));
        }
        let redis_url = std::env::var("REDIS_URL")
            .ok()
            .filter(|v| !v.trim().is_empty());
        let auth_rate_limit_login_per_minute = std::env::var("AUTH_RATE_LIMIT_LOGIN_PER_MINUTE")
            .unwrap_or_else(|_| "10".into())
            .parse()
            .context("AUTH_RATE_LIMIT_LOGIN_PER_MINUTE must be u32")?;
        let auth_rate_limit_register_per_hour = std::env::var("AUTH_RATE_LIMIT_REGISTER_PER_HOUR")
            .unwrap_or_else(|_| "5".into())
            .parse()
            .context("AUTH_RATE_LIMIT_REGISTER_PER_HOUR must be u32")?;
        let auth_rate_limit_register_global_per_hour =
            std::env::var("AUTH_RATE_LIMIT_REGISTER_GLOBAL_PER_HOUR")
                .unwrap_or_else(|_| "100".into())
                .parse()
                .context("AUTH_RATE_LIMIT_REGISTER_GLOBAL_PER_HOUR must be u32")?;
        let auth_rate_limit_password_reset_per_hour =
            std::env::var("AUTH_RATE_LIMIT_PASSWORD_RESET_PER_HOUR")
                .unwrap_or_else(|_| "5".into())
                .parse()
                .context("AUTH_RATE_LIMIT_PASSWORD_RESET_PER_HOUR must be u32")?;
        let auth_rate_limit_password_reset_global_per_hour =
            std::env::var("AUTH_RATE_LIMIT_PASSWORD_RESET_GLOBAL_PER_HOUR")
                .unwrap_or_else(|_| "100".into())
                .parse()
                .context("AUTH_RATE_LIMIT_PASSWORD_RESET_GLOBAL_PER_HOUR must be u32")?;
        let cors_allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        let session_cleanup_tick_seconds = std::env::var("SESSION_CLEANUP_TICK_SECONDS")
            .unwrap_or_else(|_| "3600".into())
            .parse()
            .context("SESSION_CLEANUP_TICK_SECONDS must be u64")?;
        if session_cleanup_tick_seconds == 0 {
            return Err(anyhow!("SESSION_CLEANUP_TICK_SECONDS must be at least 1"));
        }
        let custom_domain_cname_target = std::env::var("CUSTOM_DOMAIN_CNAME_TARGET")
            .unwrap_or_else(|_| "cname.produktive.app".into())
            .trim()
            .trim_end_matches('.')
            .to_lowercase();
        let cf_api_token = std::env::var("CF_API_TOKEN")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let cf_zone_id = std::env::var("CF_ZONE_ID")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let cf_base_url = std::env::var("CF_BASE_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_owned())
            .filter(|v| !v.is_empty());
        let cf_fallback_origin = std::env::var("CF_FALLBACK_ORIGIN")
            .ok()
            .map(|v| v.trim().trim_end_matches('.').to_lowercase())
            .filter(|v| !v.is_empty());
        let cf_dcv_delegation_uuid = std::env::var("CF_DCV_DELEGATION_UUID")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let web_dist_dir = std::env::var("WEB_DIST_DIR")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty())
            .or_else(|| Some("./web/dist".to_owned()))
            .map(PathBuf::from)
            .filter(|p| p.join("index.html").is_file());

        let polar_secret_key = std::env::var("POLAR_SECRET_KEY")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let polar_base_url = std::env::var("POLAR_BASE_URL")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let polar_webhook_secret = std::env::var("POLAR_WEBHOOK_SECRET")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let billing_reconcile_tick_seconds = std::env::var("BILLING_RECONCILE_TICK_SECONDS")
            .unwrap_or_else(|_| "86400".into())
            .parse()
            .context("BILLING_RECONCILE_TICK_SECONDS must be u64")?;
        if billing_reconcile_tick_seconds == 0 {
            return Err(anyhow!("BILLING_RECONCILE_TICK_SECONDS must be at least 1"));
        }
        let app_url = std::env::var("APP_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_owned())
            .filter(|v| !v.is_empty());
        let github_client_id = std::env::var("GITHUB_CLIENT_ID")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let github_client_secret = std::env::var("GITHUB_CLIENT_SECRET")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let github_redirect_url = std::env::var("GITHUB_REDIRECT_URL")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let local_region_slug = std::env::var("LOCAL_REGION_SLUG")
            .unwrap_or_else(|_| "eu-west".into())
            .trim()
            .to_lowercase();
        if local_region_slug.is_empty() {
            return Err(anyhow!("LOCAL_REGION_SLUG must not be empty"));
        }
        let api_local_worker_enabled = std::env::var("API_LOCAL_WORKER_ENABLED")
            .unwrap_or_else(|_| "true".into())
            .parse()
            .context("API_LOCAL_WORKER_ENABLED must be bool")?;
        let worker_token = std::env::var("WORKER_TOKEN")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let worker_tokens = parse_worker_tokens(std::env::var("WORKER_TOKENS").ok().as_deref())?;
        let worker_lease_seconds = std::env::var("WORKER_LEASE_SECONDS")
            .unwrap_or_else(|_| "30".into())
            .parse()
            .context("WORKER_LEASE_SECONDS must be u64")?;
        if worker_lease_seconds == 0 {
            return Err(anyhow!("WORKER_LEASE_SECONDS must be at least 1"));
        }
        let loki_url = std::env::var("LOKI_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_owned())
            .filter(|v| !v.is_empty());
        let loki_tenant = std::env::var("LOKI_TENANT")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let deployments_enabled = std::env::var("DEPLOYMENTS_ENABLED")
            .unwrap_or_else(|_| "false".into())
            .parse()
            .context("DEPLOYMENTS_ENABLED must be bool")?;
        let deploy_secrets_key = std::env::var("DEPLOY_SECRETS_KEY")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let deploy_max_services_per_workspace = std::env::var("DEPLOY_MAX_SERVICES_PER_WORKSPACE")
            .unwrap_or_else(|_| "3".into())
            .parse()
            .context("DEPLOY_MAX_SERVICES_PER_WORKSPACE must be i64")?;
        if deploy_max_services_per_workspace < 1 {
            return Err(anyhow!(
                "DEPLOY_MAX_SERVICES_PER_WORKSPACE must be at least 1"
            ));
        }
        let deploy_max_active_deployments_per_workspace =
            std::env::var("DEPLOY_MAX_ACTIVE_DEPLOYMENTS_PER_WORKSPACE")
                .unwrap_or_else(|_| "6".into())
                .parse()
                .context("DEPLOY_MAX_ACTIVE_DEPLOYMENTS_PER_WORKSPACE must be i64")?;
        if deploy_max_active_deployments_per_workspace < 1 {
            return Err(anyhow!(
                "DEPLOY_MAX_ACTIVE_DEPLOYMENTS_PER_WORKSPACE must be at least 1"
            ));
        }
        let fly_api_token = std::env::var("FLY_API_TOKEN")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let fly_api_hostname = std::env::var("FLY_API_HOSTNAME")
            .unwrap_or_else(|_| "https://api.machines.dev".into())
            .trim()
            .trim_end_matches('/')
            .to_owned();
        Ok(Self {
            database_url,
            database_pooled_url,
            port,
            jwt_secret,
            jwt_ttl_hours,
            password_reset_ttl_minutes,
            scheduler_tick_ms,
            scheduler_max_concurrent_checks,
            scheduler_max_due_per_tick,
            http_check_max_body_bytes,
            redis_url,
            auth_rate_limit_login_per_minute,
            auth_rate_limit_register_per_hour,
            auth_rate_limit_register_global_per_hour,
            auth_rate_limit_password_reset_per_hour,
            auth_rate_limit_password_reset_global_per_hour,
            cors_allowed_origins,
            session_cleanup_tick_seconds,
            custom_domain_cname_target,
            cf_api_token,
            cf_zone_id,
            cf_base_url,
            cf_fallback_origin,
            cf_dcv_delegation_uuid,
            web_dist_dir,
            polar_secret_key,
            polar_base_url,
            polar_webhook_secret,
            billing_reconcile_tick_seconds,
            app_url,
            github_client_id,
            github_client_secret,
            github_redirect_url,
            local_region_slug,
            api_local_worker_enabled,
            worker_token,
            worker_tokens,
            worker_lease_seconds,
            loki_url,
            loki_tenant,
            deployments_enabled,
            deploy_secrets_key,
            deploy_max_services_per_workspace,
            deploy_max_active_deployments_per_workspace,
            fly_api_token,
            fly_api_hostname,
        })
    }

    pub fn worker_token_for_region(&self, region_slug: &str) -> Option<&str> {
        self.worker_tokens
            .get(region_slug)
            .map(String::as_str)
            .or_else(|| {
                (region_slug == self.local_region_slug)
                    .then_some(self.worker_token.as_deref())
                    .flatten()
            })
    }
}

fn parse_worker_tokens(raw: Option<&str>) -> Result<BTreeMap<String, String>> {
    let mut tokens = BTreeMap::new();
    let Some(raw) = raw else {
        return Ok(tokens);
    };
    for entry in raw
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
    {
        let (region, token) = entry
            .split_once('=')
            .ok_or_else(|| anyhow!("WORKER_TOKENS entries must be region=token"))?;
        let region = region.trim().to_lowercase();
        let token = token.trim().to_owned();
        let valid_region = !region.is_empty()
            && region.len() <= 64
            && region
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        if !valid_region {
            return Err(anyhow!("WORKER_TOKENS contains invalid region slug"));
        }
        if token.is_empty() {
            return Err(anyhow!("WORKER_TOKENS contains an empty token"));
        }
        tokens.insert(region, token);
    }
    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::parse_worker_tokens;

    #[test]
    fn parses_region_scoped_worker_tokens() {
        let tokens = parse_worker_tokens(Some("eu-west=one, us-east=two")).unwrap();
        assert_eq!(tokens.get("eu-west").map(String::as_str), Some("one"));
        assert_eq!(tokens.get("us-east").map(String::as_str), Some("two"));
    }

    #[test]
    fn rejects_unscoped_worker_tokens() {
        assert!(parse_worker_tokens(Some("token-without-region")).is_err());
    }
}
