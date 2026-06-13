use crate::{
    auth::password::sha256_hex,
    error::{ApiError, ApiResult},
    state::{AppState, RedisState},
};

const RATE_LIMIT_SCRIPT: &str = r#"
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
"#;

#[derive(Clone, Copy)]
pub enum AuthLimitKind {
    Login,
    Register,
}

impl AuthLimitKind {
    fn prefix(self) -> &'static str {
        match self {
            Self::Login => "login",
            Self::Register => "register",
        }
    }

    fn limit(self, state: &AppState) -> u32 {
        match self {
            Self::Login => state.config.auth_rate_limit_login_per_minute,
            Self::Register => state.config.auth_rate_limit_register_per_hour,
        }
    }

    fn window_seconds(self) -> usize {
        match self {
            Self::Login => 60,
            Self::Register => 60 * 60,
        }
    }

    fn global_limit(self, state: &AppState) -> Option<u32> {
        match self {
            Self::Login => None,
            Self::Register => Some(state.config.auth_rate_limit_register_global_per_hour),
        }
    }
}

pub async fn check_auth(
    state: &AppState,
    _headers: &axum::http::HeaderMap,
    email: &str,
    kind: AuthLimitKind,
) -> ApiResult<()> {
    let mut redis = match state.redis.clone() {
        RedisState::Disabled => return Ok(()),
        RedisState::Unavailable => {
            return Err(ApiError::service_unavailable("rate limiter unavailable"))
        }
        RedisState::Ready(redis) => redis,
    };

    if let Some(limit) = kind.global_limit(state) {
        check_limit(
            &mut redis,
            format!("unstatus:rate_limit:auth:{}:global", kind.prefix()),
            limit,
            kind.window_seconds(),
        )
        .await?;
    }

    let identity = sha256_hex(email);
    let key = format!("unstatus:rate_limit:auth:{}:{identity}", kind.prefix());
    check_limit(&mut redis, key, kind.limit(state), kind.window_seconds()).await
}

async fn check_limit(
    redis: &mut redis::aio::ConnectionManager,
    key: String,
    limit: u32,
    window_seconds: usize,
) -> ApiResult<()> {
    if limit == 0 {
        return Err(ApiError::service_unavailable(
            "auth rate limit is disabled by config",
        ));
    }

    let script = redis::Script::new(RATE_LIMIT_SCRIPT);
    let count: i64 = script
        .key(key)
        .arg(window_seconds)
        .invoke_async(redis)
        .await
        .map_err(|e| {
            tracing::error!(error = ?e, "redis rate limit check failed");
            ApiError::service_unavailable("rate limiter unavailable")
        })?;

    if count > limit as i64 {
        return Err(ApiError::too_many_requests("rate limit exceeded"));
    }

    Ok(())
}
