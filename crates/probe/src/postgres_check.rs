use std::{
    net::SocketAddr,
    time::{Duration, Instant},
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use crate::ProbeOutcome;

const SSL_REQUEST: [u8; 8] = [0, 0, 0, 8, 4, 210, 22, 47];

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
            error: Some(format!("postgres timeout after {}ms", timeout.as_millis())),
            body: None,
            headers: None,
        },
    }
}

async fn probe(addr: SocketAddr) -> Result<(), String> {
    let mut stream = TcpStream::connect(addr).await.map_err(|e| e.to_string())?;
    stream
        .write_all(&SSL_REQUEST)
        .await
        .map_err(|e| e.to_string())?;

    let mut response = [0u8; 1];
    stream
        .read_exact(&mut response)
        .await
        .map_err(|e| e.to_string())?;

    match response[0] {
        b'S' | b'N' => Ok(()),
        other => Err(format!("unexpected postgres SSL response byte {other}")),
    }
}
