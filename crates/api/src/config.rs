use anyhow::{anyhow, Context};

#[derive(Clone, Debug)]
pub struct DatabaseConfig {
    pub database_url: String,
    pub database_direct_url: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub jwt_secret: String,
    pub cors_origins: Vec<String>,
    pub cookie_name: String,
    pub cookie_domain: Option<String>,
    pub cookie_secure: bool,
    pub session_days: i64,
    pub web_dist_dir: String,
    pub app_url: String,
    pub resend_api_key: String,
    pub resend_from_email: String,
    pub ai_api_key: String,
    pub ai_base_url: String,
    pub ai_model: String,
    pub polar_access_token: String,
    pub polar_base_url: Option<String>,
    pub polar_pro_product_id: String,
    pub polar_webhook_secret: String,
    pub unkey_root_key: String,
    pub unkey_api_id: String,
    pub unkey_base_url: Option<String>,
    pub mcp_token_encryption_key: Option<String>,
    pub enable_dev_triggers: bool,
    pub storage: Option<StorageConfig>,
}

#[derive(Clone, Debug)]
pub struct StorageConfig {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub public_url: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let database = DatabaseConfig::from_env()?;
        let jwt_secret = required_env("JWT_SECRET").context("JWT_SECRET is required")?;

        if jwt_secret.len() < 32 {
            return Err(anyhow!("JWT_SECRET must be at least 32 characters"));
        }

        let port = env_or_default("PORT", "3000")
            .parse()
            .context("PORT must be a valid u16")?;
        let cookie_secure = env_or_default("AUTH_COOKIE_SECURE", "false")
            .parse()
            .context("AUTH_COOKIE_SECURE must be true or false")?;
        let app_url = env_or_default("APP_URL", "http://localhost:3000")
            .trim_end_matches('/')
            .to_owned();
        let mcp_token_encryption_key = optional_env("MCP_TOKEN_ENCRYPTION_KEY");

        if mcp_token_encryption_key.is_none() && is_production_like_url_or_env(&app_url) {
            return Err(anyhow!(
                "MCP_TOKEN_ENCRYPTION_KEY is required for production-like deployments"
            ));
        }

        Ok(Self {
            database_url: database.database_url,
            port,
            jwt_secret,
            cors_origins: env_or_default(
                "CORS_ORIGINS",
                "https://produktive.app,https://*.produktive.app,http://localhost:5173,http://127.0.0.1:5173",
            )
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
            cookie_name: env_or_default("AUTH_COOKIE_NAME", "produktive_session"),
            cookie_domain: std::env::var("AUTH_COOKIE_DOMAIN")
                .ok()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
            cookie_secure,
            session_days: env_or_default("AUTH_SESSION_DAYS", "30")
                .parse()
                .context("AUTH_SESSION_DAYS must be a number")?,
            web_dist_dir: env_or_default("WEB_DIST_DIR", "web/dist"),
            app_url,
            resend_api_key: required_env("RESEND_API_KEY").context("RESEND_API_KEY is required")?,
            resend_from_email: env_or_default("RESEND_FROM_EMAIL", "Produktive <be@produktive.app>"),
            ai_api_key: required_env("AI_API_KEY").context("AI_API_KEY is required")?,
            ai_base_url: env_or_default("AI_BASE_URL", "https://ollama.com/v1"),
            ai_model: env_or_default("AI_MODEL", "glm-5.1"),
            polar_access_token: required_env("POLAR_ACCESS_TOKEN")
                .context("POLAR_ACCESS_TOKEN is required")?,
            polar_base_url: optional_env("POLAR_BASE_URL"),
            polar_pro_product_id: required_env("POLAR_PRO_PRODUCT_ID")
                .context("POLAR_PRO_PRODUCT_ID is required")?,
            polar_webhook_secret: required_env("POLAR_WEBHOOK_SECRET")
                .context("POLAR_WEBHOOK_SECRET is required")?,
            unkey_root_key: required_env("UNKEY_ROOT_KEY").context("UNKEY_ROOT_KEY is required")?,
            unkey_api_id: required_env("UNKEY_API_ID").context("UNKEY_API_ID is required")?,
            unkey_base_url: optional_env("UNKEY_BASE_URL"),
            mcp_token_encryption_key,
            enable_dev_triggers: env_or_default("ENABLE_DEV_TRIGGERS", "false")
                .parse()
                .context("ENABLE_DEV_TRIGGERS must be true or false")?,
            storage: StorageConfig::from_env()?,
        })
    }

    pub fn mcp_token_key(&self) -> String {
        self.mcp_token_encryption_key
            .clone()
            .unwrap_or_else(|| self.jwt_secret.clone())
    }

    pub fn warn_if_insecure_cookie_settings(&self) {
        if self.app_url.starts_with("https://") && !self.cookie_secure {
            tracing::warn!(
                app_url = %self.app_url,
                cookie_secure = self.cookie_secure,
                "AUTH_COOKIE_SECURE=false while APP_URL uses HTTPS"
            );
        }
    }
}

impl StorageConfig {
    fn from_env() -> anyhow::Result<Option<Self>> {
        let bucket = optional_env("S3_BUCKET");
        let endpoint = optional_env("S3_ENDPOINT");
        let access_key_id = optional_env("S3_ACCESS_KEY_ID");
        let secret_access_key = optional_env("S3_SECRET_ACCESS_KEY");

        if bucket.is_none()
            && endpoint.is_none()
            && access_key_id.is_none()
            && secret_access_key.is_none()
        {
            return Ok(None);
        }

        Ok(Some(Self {
            endpoint: endpoint.ok_or_else(|| anyhow!("S3_ENDPOINT is required"))?,
            region: env_or_default("S3_REGION", "auto"),
            bucket: bucket.ok_or_else(|| anyhow!("S3_BUCKET is required"))?,
            access_key_id: access_key_id.ok_or_else(|| anyhow!("S3_ACCESS_KEY_ID is required"))?,
            secret_access_key: secret_access_key
                .ok_or_else(|| anyhow!("S3_SECRET_ACCESS_KEY is required"))?,
            public_url: Some(env_or_default(
                "S3_PUBLIC_URL",
                "https://cdn.produktive.app",
            )),
        }))
    }
}

impl DatabaseConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = required_env("DATABASE_URL")?;
        let database_direct_url = env_or_default("DATABASE_DIRECT_URL", &database_url);

        Ok(Self {
            database_url,
            database_direct_url,
        })
    }
}

fn required_env(key: &str) -> anyhow::Result<String> {
    std::env::var(key)
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("{key} is required"))
}

fn optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn env_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn is_production_like_url_or_env(app_url: &str) -> bool {
    let env_is_prod = [
        "APP_ENV",
        "NODE_ENV",
        "RAILWAY_ENVIRONMENT",
        "RAILWAY_ENVIRONMENT_NAME",
    ]
    .iter()
    .filter_map(|key| std::env::var(key).ok())
    .any(|value| matches!(value.as_str(), "prod" | "production"));
    env_is_prod || is_production_like_url(app_url)
}

fn is_production_like_url(app_url: &str) -> bool {
    app_url.starts_with("https://") && !is_local_app_url(app_url)
}

fn is_local_app_url(app_url: &str) -> bool {
    app_url.contains("://localhost")
        || app_url.contains("://127.0.0.1")
        || app_url.contains("://[::1]")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_like_detection_requires_real_https_or_prod_env() {
        assert!(!is_production_like_url("http://localhost:3000"));
        assert!(!is_production_like_url("https://localhost:3000"));
        assert!(is_production_like_url("https://produktive.app"));
    }
}
