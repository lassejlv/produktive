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
    pub scheduler_tick_ms: u64,
    pub scheduler_max_concurrent_checks: usize,
    pub scheduler_max_due_per_tick: u64,
    pub http_check_max_body_bytes: usize,
    pub redis_url: Option<String>,
    pub auth_rate_limit_login_per_minute: u32,
    pub auth_rate_limit_register_per_hour: u32,
    pub auth_rate_limit_register_global_per_hour: u32,
    pub cors_allowed_origins: Vec<String>,
    pub session_cleanup_tick_seconds: u64,
    pub custom_domain_cname_target: String,
    pub custom_domain_proxy_ipv4: Option<String>,
    pub custom_domain_proxy_ipv6: Option<String>,
    /// Directory containing the built web frontend (`index.html`, `assets/`, ...).
    /// When `None`, static-file serving is disabled.
    pub web_dist_dir: Option<PathBuf>,
    pub autumn_secret_key: Option<String>,
    pub autumn_base_url: Option<String>,
    pub autumn_api_version: Option<String>,
    /// Public app URL for billing checkout redirects (e.g. `http://localhost:5173`).
    pub app_url: Option<String>,
    pub admin_emails: Vec<String>,
    pub local_region_slug: String,
    pub api_local_worker_enabled: bool,
    pub worker_token: Option<String>,
    pub worker_tokens: BTreeMap<String, String>,
    pub worker_lease_seconds: u64,
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
            .unwrap_or_else(|_| "custom.unstatus.network".into())
            .trim()
            .trim_end_matches('.')
            .to_lowercase();
        let custom_domain_proxy_ipv4 = std::env::var("CUSTOM_DOMAIN_PROXY_IPV4")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let custom_domain_proxy_ipv6 = std::env::var("CUSTOM_DOMAIN_PROXY_IPV6")
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

        let autumn_secret_key = std::env::var("AUTUMN_SECRET_KEY")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let autumn_base_url = std::env::var("AUTUMN_BASE_URL")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let autumn_api_version = std::env::var("AUTUMN_API_VERSION")
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let app_url = std::env::var("APP_URL")
            .ok()
            .map(|v| v.trim().trim_end_matches('/').to_owned())
            .filter(|v| !v.is_empty());
        let admin_emails = std::env::var("ADMIN_EMAILS")
            .unwrap_or_default()
            .split(',')
            .map(|email| email.trim().to_lowercase())
            .filter(|email| !email.is_empty())
            .collect();
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

        Ok(Self {
            database_url,
            database_pooled_url,
            port,
            jwt_secret,
            jwt_ttl_hours,
            scheduler_tick_ms,
            scheduler_max_concurrent_checks,
            scheduler_max_due_per_tick,
            http_check_max_body_bytes,
            redis_url,
            auth_rate_limit_login_per_minute,
            auth_rate_limit_register_per_hour,
            auth_rate_limit_register_global_per_hour,
            cors_allowed_origins,
            session_cleanup_tick_seconds,
            custom_domain_cname_target,
            custom_domain_proxy_ipv4,
            custom_domain_proxy_ipv6,
            web_dist_dir,
            autumn_secret_key,
            autumn_base_url,
            autumn_api_version,
            app_url,
            admin_emails,
            local_region_slug,
            api_local_worker_enabled,
            worker_token,
            worker_tokens,
            worker_lease_seconds,
        })
    }

    pub fn is_admin_email(&self, email: &str) -> bool {
        let email = email.trim().to_lowercase();
        self.admin_emails
            .iter()
            .any(|candidate| candidate == &email)
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
