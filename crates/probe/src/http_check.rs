use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client,
};

use crate::{target, ProbeOutcome, ProbeSpec};

pub async fn run(
    _http: &Client,
    spec: &ProbeSpec,
    target: &target::ValidatedHttpTarget,
    timeout: Duration,
    max_body_bytes: usize,
    capture_body: bool,
    request_headers: &[(String, String)],
) -> ProbeOutcome {
    let headers = match build_request_headers(request_headers) {
        Ok(headers) => headers,
        Err(e) => {
            return ProbeOutcome {
                status: 0,
                latency_ms: None,
                status_code: None,
                error: Some(e),
                body: None,
                headers: None,
            };
        }
    };
    let http = match Client::builder()
        .user_agent("produktive/0.1")
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(&target.host, &target.addrs)
        .build()
    {
        Ok(client) => client,
        Err(e) => {
            return ProbeOutcome {
                status: 0,
                latency_ms: None,
                status_code: None,
                error: Some(e.to_string()),
                body: None,
                headers: None,
            };
        }
    };

    let start = Instant::now();
    let req = http
        .get(&spec.target)
        .headers(headers)
        .timeout(timeout)
        .send();
    match req.await {
        Ok(resp) => {
            let status = resp.status();
            let code = status.as_u16() as i32;
            let response_headers = if capture_body {
                Some(capture_response_headers(resp.headers()))
            } else {
                None
            };
            let want = spec.expected_status.unwrap_or(0);
            let status_ok = if want > 0 {
                code == want
            } else {
                status.is_success()
            };

            let needs_body = spec.expected_body_contains.is_some() || capture_body;
            let (body_ok, captured_body) = if needs_body {
                let needle = spec.expected_body_contains.as_deref();
                match read_body(resp, needle, max_body_bytes).await {
                    Ok((found_needle, body)) => (found_needle, Some(body)),
                    Err(e) => {
                        return ProbeOutcome {
                            status: 0,
                            latency_ms: Some(start.elapsed().as_millis() as i32),
                            status_code: Some(code),
                            error: Some(e),
                            body: None,
                            headers: response_headers,
                        };
                    }
                }
            } else {
                (true, None)
            };

            let latency = start.elapsed().as_millis() as i32;
            let captured_body = if capture_body { captured_body } else { None };
            if status_ok && body_ok {
                ProbeOutcome {
                    status: 1,
                    latency_ms: Some(latency),
                    status_code: Some(code),
                    error: None,
                    body: captured_body,
                    headers: response_headers,
                }
            } else {
                ProbeOutcome {
                    status: 0,
                    latency_ms: Some(latency),
                    status_code: Some(code),
                    error: Some(if !status_ok {
                        format!("unexpected status {code}")
                    } else {
                        "body match failed".to_string()
                    }),
                    body: captured_body,
                    headers: response_headers,
                }
            }
        }
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

fn build_request_headers(headers: &[(String, String)]) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (name, value) in headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("invalid request header name `{name}`"))?;
        let value = HeaderValue::from_str(value)
            .map_err(|_| format!("invalid request header value for `{name}`"))?;
        map.insert(name, value);
    }
    Ok(map)
}

fn capture_response_headers(headers: &HeaderMap) -> serde_json::Map<String, serde_json::Value> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            value.to_str().ok().map(|value| {
                (
                    name.as_str().to_ascii_lowercase(),
                    serde_json::Value::String(value.to_string()),
                )
            })
        })
        .collect()
}

async fn read_body(
    resp: reqwest::Response,
    needle: Option<&str>,
    max_body_bytes: usize,
) -> Result<(bool, String), String> {
    let mut total = 0usize;
    let mut body = Vec::new();
    let needle_bytes = needle.map(|s| s.as_bytes());
    let mut found = needle_bytes.is_none() || needle_bytes.map(|n| n.is_empty()).unwrap_or(true);
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        total = total.saturating_add(chunk.len());
        if total > max_body_bytes {
            let allowed = max_body_bytes.saturating_sub(body.len());
            body.extend_from_slice(&chunk[..allowed.min(chunk.len())]);
            break;
        }
        body.extend_from_slice(&chunk);
        if !found {
            if let Some(n) = needle_bytes {
                if body.windows(n.len()).any(|w| w == n) {
                    found = true;
                }
            }
        }
    }
    let text = String::from_utf8_lossy(&body).into_owned();
    Ok((found, text))
}
