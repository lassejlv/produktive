use std::{net::SocketAddr, time::Duration};

use surge_ping::{Client, Config, PingIdentifier, PingSequence, ICMP};

use crate::ProbeOutcome;

pub async fn run(addr: SocketAddr, timeout: Duration) -> ProbeOutcome {
    let addr = addr.ip();

    let cfg = if addr.is_ipv4() {
        Config::builder().kind(ICMP::V4).build()
    } else {
        Config::builder().kind(ICMP::V6).build()
    };
    let client = match Client::new(&cfg) {
        Ok(c) => c,
        Err(e) => {
            return ProbeOutcome {
                status: 0,
                latency_ms: None,
                status_code: None,
                error: Some(format!("icmp socket: {e} (needs CAP_NET_RAW)")),
                body: None,
                headers: None,
            };
        }
    };

    let mut pinger = client.pinger(addr, PingIdentifier(rand::random())).await;
    pinger.timeout(timeout);
    let payload = [0u8; 32];
    match pinger.ping(PingSequence(0), &payload).await {
        Ok((_packet, rtt)) => ProbeOutcome {
            status: 1,
            latency_ms: Some(rtt.as_millis() as i32),
            status_code: None,
            error: None,
            body: None,
            headers: None,
        },
        Err(e) => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: None,
            error: Some(e.to_string()),
            body: None,
            headers: None,
        },
    }
}
