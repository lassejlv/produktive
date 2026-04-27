use anyhow::{anyhow, Context};

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
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = required_env("DATABASE_URL")?;
        let jwt_secret = required_env("JWT_SECRET").context("JWT_SECRET is required")?;

        if jwt_secret.len() < 32 {
            return Err(anyhow!("JWT_SECRET must be at least 32 characters"));
        }

        Ok(Self {
            database_url,
            port: env_or_default("PORT", "3000").parse().context("PORT must be a valid u16")?,
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
            cookie_secure: env_or_default("AUTH_COOKIE_SECURE", "false")
                .parse()
                .context("AUTH_COOKIE_SECURE must be true or false")?,
            session_days: env_or_default("AUTH_SESSION_DAYS", "30")
                .parse()
                .context("AUTH_SESSION_DAYS must be a number")?,
            web_dist_dir: env_or_default("WEB_DIST_DIR", "web/dist"),
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

fn env_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}
