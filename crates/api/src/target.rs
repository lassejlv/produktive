use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use entity::monitor::MonitorKind;
use tokio::net::lookup_host;
use url::Url;

use crate::error::{ApiError, ApiResult};

pub struct ValidatedHttpTarget {
    pub host: String,
    pub addrs: Vec<SocketAddr>,
}

pub async fn validate_monitor(kind: MonitorKind, target: &str) -> ApiResult<String> {
    let target = target.trim();
    if target.is_empty() {
        return Err(ApiError::bad_request("target required"));
    }

    let addrs = match kind {
        MonitorKind::Http => validate_http_addrs(target).await?,
        MonitorKind::Tcp => validate_tcp(target).await?,
        MonitorKind::Ping => validate_ping(target).await?,
        MonitorKind::Postgres => validate_tcp(target).await?,
        MonitorKind::Redis => validate_tcp(target).await?,
        MonitorKind::Ssh => validate_tcp(target).await?,
    };

    ensure_public_addrs(&addrs)?;
    Ok(target.to_string())
}

pub async fn validate_webhook_target(target: &str) -> ApiResult<ValidatedHttpTarget> {
    let target = target.trim();
    if target.is_empty() {
        return Err(ApiError::bad_request("webhook url required"));
    }
    let validated = validate_http(target).await?;
    ensure_public_addrs(&validated.addrs)?;
    Ok(validated)
}

async fn validate_http_addrs(target: &str) -> ApiResult<Vec<SocketAddr>> {
    let validated = validate_http(target).await?;
    Ok(validated.addrs)
}

async fn validate_http(target: &str) -> ApiResult<ValidatedHttpTarget> {
    let url = Url::parse(target).map_err(|_| ApiError::bad_request("invalid http target"))?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err(ApiError::bad_request("http target must use http or https")),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ApiError::bad_request(
            "http target cannot include credentials",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| ApiError::bad_request("http target host required"))?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| ApiError::bad_request("http target port required"))?;
    let addrs = resolve_host_port(host, port).await?;
    Ok(ValidatedHttpTarget {
        host: host.to_string(),
        addrs,
    })
}

async fn validate_tcp(target: &str) -> ApiResult<Vec<SocketAddr>> {
    if target.contains("://") {
        return Err(ApiError::bad_request("tcp target must be host:port"));
    }
    lookup_host(target)
        .await
        .map(|iter| iter.collect())
        .map_err(|_| ApiError::bad_request("invalid tcp target"))
}

async fn validate_ping(target: &str) -> ApiResult<Vec<SocketAddr>> {
    if target.contains("://") || target.contains('/') {
        return Err(ApiError::bad_request(
            "ping target must be a host or IP address",
        ));
    }
    resolve_host_port(target, 0).await
}

async fn resolve_host_port(host: &str, port: u16) -> ApiResult<Vec<SocketAddr>> {
    lookup_host((host, port))
        .await
        .map(|iter| iter.collect())
        .map_err(|_| ApiError::bad_request("target host could not be resolved"))
}

fn ensure_public_addrs(addrs: &[SocketAddr]) -> ApiResult<()> {
    if addrs.is_empty() {
        return Err(ApiError::bad_request("target host could not be resolved"));
    }
    if addrs.iter().any(|addr| !is_public_ip(addr.ip())) {
        return Err(ApiError::bad_request(
            "target must resolve to public internet addresses",
        ));
    }
    Ok(())
}

pub(crate) fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
            Some(mapped) => is_public_ipv4(mapped),
            None => is_public_ipv6(ip),
        },
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, d] = ip.octets();
    if a == 0 || a == 10 || a == 127 || a >= 224 || ip == Ipv4Addr::new(255, 255, 255, 255) {
        return false;
    }
    if a == 100 && (64..=127).contains(&b) {
        return false;
    }
    if a == 169 && b == 254 {
        return false;
    }
    if a == 172 && (16..=31).contains(&b) {
        return false;
    }
    if a == 192 && b == 168 {
        return false;
    }
    if a == 192 && b == 0 && c == 0 {
        return false;
    }
    if a == 192 && b == 0 && c == 2 {
        return false;
    }
    if a == 198 && (b == 18 || b == 19) {
        return false;
    }
    if a == 198 && b == 51 && c == 100 {
        return false;
    }
    if a == 203 && b == 0 && c == 113 {
        return false;
    }
    if a == 169 && b == 254 && c == 169 && d == 254 {
        return false;
    }
    true
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    if ip.is_unspecified() || ip.is_loopback() || ip.is_multicast() {
        return false;
    }
    if (segments[0] & 0xfe00) == 0xfc00 {
        return false;
    }
    if (segments[0] & 0xffc0) == 0xfe80 {
        return false;
    }
    if segments[0] == 0x2001 && segments[1] == 0x0db8 {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::is_public_ip;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    #[test]
    fn rejects_non_public_ipv4_ranges() {
        for ip in [
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(127, 0, 0, 1),
            Ipv4Addr::new(169, 254, 169, 254),
            Ipv4Addr::new(172, 16, 0, 1),
            Ipv4Addr::new(192, 168, 1, 1),
            Ipv4Addr::new(198, 51, 100, 10),
            Ipv4Addr::new(224, 0, 0, 1),
        ] {
            assert!(!is_public_ip(IpAddr::V4(ip)), "{ip} should be rejected");
        }
    }

    #[test]
    fn allows_public_ipv4() {
        assert!(is_public_ip(IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34))));
    }

    #[test]
    fn rejects_non_public_ipv6_ranges() {
        for ip in [
            Ipv6Addr::LOCALHOST,
            "fc00::1".parse().unwrap(),
            "fe80::1".parse().unwrap(),
            "2001:db8::1".parse().unwrap(),
            "ff02::1".parse().unwrap(),
        ] {
            assert!(!is_public_ip(IpAddr::V6(ip)), "{ip} should be rejected");
        }
    }

    #[test]
    fn rejects_ipv4_mapped_ipv6_private_ranges() {
        for ip in [
            "::ffff:10.0.0.1",
            "::ffff:127.0.0.1",
            "::ffff:172.16.0.1",
            "::ffff:192.168.1.1",
            "::ffff:169.254.169.254",
        ] {
            let ip = ip.parse().unwrap();
            assert!(!is_public_ip(IpAddr::V6(ip)), "{ip} should be rejected");
        }
    }
}
