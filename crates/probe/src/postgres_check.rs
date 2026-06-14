use std::time::{Duration, Instant};

use tokio_postgres::NoTls;

use crate::ProbeOutcome;

pub async fn run(target: &str, query: &str, timeout: Duration) -> ProbeOutcome {
    let start = Instant::now();
    match tokio::time::timeout(timeout, probe(target, query)).await {
        Ok(Ok(row_count)) => ProbeOutcome {
            status: 1,
            latency_ms: Some(start.elapsed().as_millis() as i32),
            status_code: Some(0),
            error: None,
            body: Some(serde_json::json!({ "rows": row_count }).to_string()),
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
                "postgres query timeout after {}ms",
                timeout.as_millis()
            )),
            body: None,
            headers: None,
        },
    }
}

async fn probe(target: &str, query: &str) -> Result<usize, String> {
    let (client, connection) = tokio_postgres::connect(&connection_config(target), NoTls)
        .await
        .map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            tracing::debug!(error = ?error, "postgres probe connection task failed");
        }
    });

    let rows = client.query(query, &[]).await.map_err(|e| e.to_string())?;
    Ok(rows.len())
}

fn connection_config(target: &str) -> String {
    if target.contains("://") {
        return target.to_owned();
    }
    let Some((host, port)) = target.rsplit_once(':') else {
        return format!("host={target}");
    };
    if port.parse::<u16>().is_ok() {
        format!("host={host} port={port}")
    } else {
        format!("host={target}")
    }
}

#[cfg(test)]
mod tests {
    use super::connection_config;

    #[test]
    fn keeps_postgres_urls_as_connection_config() {
        assert_eq!(
            connection_config("postgres://user:pass@db.example.com/app"),
            "postgres://user:pass@db.example.com/app"
        );
    }

    #[test]
    fn maps_host_port_to_connection_config() {
        assert_eq!(
            connection_config("db.example.com:5432"),
            "host=db.example.com port=5432"
        );
    }
}
