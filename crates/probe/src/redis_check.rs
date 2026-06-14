use std::time::{Duration, Instant};

use crate::ProbeOutcome;

pub async fn run(target: &str, command: &str, timeout: Duration) -> ProbeOutcome {
    let start = Instant::now();
    match tokio::time::timeout(timeout, probe(target, command)).await {
        Ok(Ok(body)) => ProbeOutcome {
            status: 1,
            latency_ms: Some(start.elapsed().as_millis() as i32),
            status_code: Some(0),
            error: None,
            body: Some(body),
            headers: None,
        },
        Ok(Err(e)) => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: Some(1),
            error: Some(e),
            body: None,
            headers: None,
        },
        Err(_) => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: Some(1),
            error: Some(format!(
                "redis command timeout after {}ms",
                timeout.as_millis()
            )),
            body: None,
            headers: None,
        },
    }
}

async fn probe(target: &str, command: &str) -> Result<String, String> {
    let client = redis::Client::open(redis_url(target)).map_err(|e| e.to_string())?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| e.to_string())?;
    let parts = command_parts(command)?;
    let name = parts
        .first()
        .ok_or_else(|| "redis command required".to_string())?;
    let mut cmd = redis::cmd(name);
    for arg in parts.iter().skip(1) {
        cmd.arg(arg);
    }
    let value: redis::Value = cmd
        .query_async(&mut connection)
        .await
        .map_err(|e| e.to_string())?;
    Ok(format_redis_value(&value))
}

fn redis_url(target: &str) -> String {
    if target.contains("://") {
        target.to_owned()
    } else {
        format!("redis://{target}")
    }
}

fn command_parts(command: &str) -> Result<Vec<String>, String> {
    let parts: Vec<String> = command
        .split_whitespace()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_owned)
        .collect();
    if parts.is_empty() {
        Err("redis command required".into())
    } else {
        Ok(parts)
    }
}

fn format_redis_value(value: &redis::Value) -> String {
    match value {
        redis::Value::Nil => "null".to_owned(),
        redis::Value::Int(n) => n.to_string(),
        redis::Value::BulkString(bytes) => String::from_utf8_lossy(bytes).to_string(),
        redis::Value::SimpleString(value) => value.clone(),
        redis::Value::Okay => "OK".to_owned(),
        redis::Value::Array(values) => serde_json::to_string(
            &values
                .iter()
                .map(format_redis_value)
                .collect::<Vec<String>>(),
        )
        .unwrap_or_else(|_| "[]".to_owned()),
        other => format!("{other:?}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{command_parts, redis_url};

    #[test]
    fn wraps_host_port_as_redis_url() {
        assert_eq!(
            redis_url("cache.example.com:6379"),
            "redis://cache.example.com:6379"
        );
    }

    #[test]
    fn splits_simple_command() {
        assert_eq!(
            command_parts("GET health").unwrap(),
            vec!["GET".to_string(), "health".to_string()]
        );
    }
}
