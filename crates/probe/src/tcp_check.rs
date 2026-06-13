use std::{
    net::SocketAddr,
    time::{Duration, Instant},
};

use tokio::net::TcpStream;

use crate::ProbeOutcome;

pub async fn run(addr: SocketAddr, timeout: Duration) -> ProbeOutcome {
    let start = Instant::now();
    let res = tokio::time::timeout(timeout, TcpStream::connect(addr)).await;
    match res {
        Ok(Ok(_stream)) => ProbeOutcome {
            status: 1,
            latency_ms: Some(start.elapsed().as_millis() as i32),
            status_code: None,
            error: None,
            body: None,
            headers: None,
        },
        Ok(Err(e)) => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: None,
            error: Some(e.to_string()),
            body: None,
            headers: None,
        },
        Err(_) => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: None,
            error: Some(format!("tcp timeout after {}ms", timeout.as_millis())),
            body: None,
            headers: None,
        },
    }
}
