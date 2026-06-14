use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Router,
};
use serde_json::Value;
use standardwebhooks::{Webhook, HEADER_WEBHOOK_ID};

use crate::{
    billing::{handle_polar_webhook, PolarWebhookPayload},
    error::{ApiError, ApiResult},
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/polar", post(polar_webhook))
}

pub async fn polar_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<StatusCode> {
    let secret = state
        .config
        .polar_webhook_secret
        .as_deref()
        .ok_or_else(|| ApiError::service_unavailable("POLAR_WEBHOOK_SECRET is not configured"))?;
    verify_polar_signature(secret, &body, &headers)?;

    let webhook_id = header_string(&headers, HEADER_WEBHOOK_ID)
        .ok_or_else(|| ApiError::bad_request("missing Polar webhook id"))?;
    let raw_payload: Value = serde_json::from_slice(&body)
        .map_err(|_| ApiError::bad_request("invalid Polar webhook payload"))?;
    let payload: PolarWebhookPayload = serde_json::from_value(raw_payload.clone())
        .map_err(|_| ApiError::bad_request("invalid Polar webhook payload"))?;

    handle_polar_webhook(&state, webhook_id, payload, raw_payload).await?;
    Ok(StatusCode::ACCEPTED)
}

fn verify_polar_signature(secret: &str, body: &[u8], headers: &HeaderMap) -> ApiResult<()> {
    if let Ok(verifier) = Webhook::new(secret) {
        if verifier.verify(body, headers).is_ok() {
            return Ok(());
        }
    }
    let verifier = Webhook::from_bytes(secret.as_bytes().to_vec())
        .map_err(|_| ApiError::service_unavailable("POLAR_WEBHOOK_SECRET is invalid"))?;
    verifier
        .verify(body, headers)
        .map_err(|_| ApiError::Forbidden)
}

fn header_string(headers: &HeaderMap, name: &'static str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use standardwebhooks::{HEADER_WEBHOOK_SIGNATURE, HEADER_WEBHOOK_TIMESTAMP};

    const BODY: &[u8] = br#"{"type":"customer.state_changed","data":{"id":"cus_1"}}"#;
    const WEBHOOK_ID: &str = "msg_123";

    #[test]
    fn verifies_base64_standard_webhook_secret() {
        let secret = "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD";
        let headers = signed_headers(Webhook::new(secret).unwrap(), BODY);
        assert!(verify_polar_signature(secret, BODY, &headers).is_ok());
    }

    #[test]
    fn verifies_raw_dashboard_secret() {
        let secret = "polar-local-secret";
        let headers = signed_headers(
            Webhook::from_bytes(secret.as_bytes().to_vec()).unwrap(),
            BODY,
        );
        assert!(verify_polar_signature(secret, BODY, &headers).is_ok());
    }

    #[test]
    fn rejects_invalid_signature() {
        let secret = "polar-local-secret";
        let mut headers = signed_headers(
            Webhook::from_bytes(secret.as_bytes().to_vec()).unwrap(),
            BODY,
        );
        headers.insert(HEADER_WEBHOOK_SIGNATURE, "v1,bad".parse().unwrap());
        assert!(verify_polar_signature(secret, BODY, &headers).is_err());
    }

    fn signed_headers(verifier: Webhook, body: &[u8]) -> HeaderMap {
        let timestamp = Utc::now().timestamp();
        let signature = verifier.sign(WEBHOOK_ID, timestamp, body).unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(HEADER_WEBHOOK_ID, WEBHOOK_ID.parse().unwrap());
        headers.insert(
            HEADER_WEBHOOK_TIMESTAMP,
            timestamp.to_string().parse().unwrap(),
        );
        headers.insert(HEADER_WEBHOOK_SIGNATURE, signature.parse().unwrap());
        headers
    }
}
