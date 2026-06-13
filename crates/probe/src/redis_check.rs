use std::{
    net::SocketAddr,
    time::{Duration, Instant},
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use crate::ProbeOutcome;

pub async fn run(addr: SocketAddr, timeout: Duration) -> ProbeOutcome {
    let start = Instant::now();
    match tokio::time::timeout(timeout, probe(addr)).await {
        Ok(Ok(())) => ProbeOutcome {
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
            error: Some(e),
            body: None,
            headers: None,
        },
        Err(_) => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: None,
            error: Some(format!("redis timeout after {}ms", timeout.as_millis())),
            body: None,
            headers: None,
        },
    }
}

async fn probe(addr: SocketAddr) -> Result<(), String> {
    let mut stream = TcpStream::connect(addr).await.map_err(|e| e.to_string())?;
    stream
        .write_all(b"*1\r\n$4\r\nPING\r\n")
        .await
        .map_err(|e| e.to_string())?;

    let mut buf = [0u8; 256];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("redis closed connection without response".into());
    }

    let response = String::from_utf8_lossy(&buf[..n]).to_ascii_uppercase();
    if response.starts_with("+PONG") || response.contains("NOAUTH") || response.contains("AUTH") {
        Ok(())
    } else {
        Err(format!("unexpected redis response: {}", response.trim()))
    }
}
