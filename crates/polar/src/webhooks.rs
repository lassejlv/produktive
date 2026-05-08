use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::Result;

type HmacSha256 = Hmac<Sha256>;

const HEADER_WEBHOOK_ID: &str = "webhook-id";
const HEADER_WEBHOOK_SIGNATURE: &str = "webhook-signature";
const HEADER_WEBHOOK_TIMESTAMP: &str = "webhook-timestamp";
const HEADER_SVIX_ID: &str = "svix-id";
const HEADER_SVIX_SIGNATURE: &str = "svix-signature";
const HEADER_SVIX_TIMESTAMP: &str = "svix-timestamp";
const SIGNATURE_VERSION_COMMA: &str = "v1,";
const SIGNATURE_VERSION_EQUALS: &str = "v1=";
const TOLERANCE_IN_SECONDS: i64 = 5 * 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebhookEventType {
    #[serde(rename = "checkout.created")]
    CheckoutCreated,
    #[serde(rename = "checkout.updated")]
    CheckoutUpdated,
    #[serde(rename = "checkout.expired")]
    CheckoutExpired,
    #[serde(rename = "customer.created")]
    CustomerCreated,
    #[serde(rename = "customer.updated")]
    CustomerUpdated,
    #[serde(rename = "customer.deleted")]
    CustomerDeleted,
    #[serde(rename = "customer.state_changed")]
    CustomerStateChanged,
    #[serde(rename = "customer_seat.assigned")]
    CustomerSeatAssigned,
    #[serde(rename = "customer_seat.claimed")]
    CustomerSeatClaimed,
    #[serde(rename = "customer_seat.revoked")]
    CustomerSeatRevoked,
    #[serde(rename = "member.created")]
    MemberCreated,
    #[serde(rename = "member.updated")]
    MemberUpdated,
    #[serde(rename = "member.deleted")]
    MemberDeleted,
    #[serde(rename = "order.created")]
    OrderCreated,
    #[serde(rename = "order.updated")]
    OrderUpdated,
    #[serde(rename = "order.paid")]
    OrderPaid,
    #[serde(rename = "order.refunded")]
    OrderRefunded,
    #[serde(rename = "subscription.created")]
    SubscriptionCreated,
    #[serde(rename = "subscription.updated")]
    SubscriptionUpdated,
    #[serde(rename = "subscription.active")]
    SubscriptionActive,
    #[serde(rename = "subscription.canceled")]
    SubscriptionCanceled,
    #[serde(rename = "subscription.uncanceled")]
    SubscriptionUncanceled,
    #[serde(rename = "subscription.revoked")]
    SubscriptionRevoked,
    #[serde(rename = "subscription.past_due")]
    SubscriptionPastDue,
    #[serde(rename = "refund.created")]
    RefundCreated,
    #[serde(rename = "refund.updated")]
    RefundUpdated,
    #[serde(rename = "product.created")]
    ProductCreated,
    #[serde(rename = "product.updated")]
    ProductUpdated,
    #[serde(rename = "benefit.created")]
    BenefitCreated,
    #[serde(rename = "benefit.updated")]
    BenefitUpdated,
    #[serde(rename = "benefit_grant.created")]
    BenefitGrantCreated,
    #[serde(rename = "benefit_grant.cycled")]
    BenefitGrantCycled,
    #[serde(rename = "benefit_grant.updated")]
    BenefitGrantUpdated,
    #[serde(rename = "benefit_grant.revoked")]
    BenefitGrantRevoked,
    #[serde(rename = "organization.updated")]
    OrganizationUpdated,
    #[serde(untagged)]
    Unknown(String),
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebhookEvent {
    #[serde(rename = "type")]
    pub event_type: WebhookEventType,
    #[serde(flatten)]
    pub payload: Value,
}

pub fn validate_event(
    payload: impl AsRef<[u8]>,
    headers: &HeaderMap,
    secret: &str,
) -> Result<WebhookEvent> {
    let payload = payload.as_ref();
    verify_signature(payload, headers, secret)?;
    Ok(serde_json::from_slice(payload)?)
}

fn verify_signature(payload: &[u8], headers: &HeaderMap, secret: &str) -> Result<()> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err(crate::error::PolarError::Webhook(
            "webhook secret is empty".to_owned(),
        ));
    }

    let msg_id = header_value(headers, HEADER_WEBHOOK_ID)
        .or_else(|| header_value(headers, HEADER_SVIX_ID))
        .ok_or_else(|| missing_header("id"))?;
    let msg_signature = header_value(headers, HEADER_WEBHOOK_SIGNATURE)
        .or_else(|| header_value(headers, HEADER_SVIX_SIGNATURE))
        .ok_or_else(|| missing_header("signature"))?;
    let msg_ts = header_value(headers, HEADER_WEBHOOK_TIMESTAMP)
        .or_else(|| header_value(headers, HEADER_SVIX_TIMESTAMP))
        .ok_or_else(|| missing_header("timestamp"))?
        .parse::<i64>()
        .map_err(|_| crate::error::PolarError::Webhook("invalid timestamp".to_owned()))?;

    verify_timestamp(msg_ts)?;
    let payload = std::str::from_utf8(payload)
        .map_err(|_| crate::error::PolarError::Webhook("payload is not UTF-8".to_owned()))?;
    let to_sign = format!("{msg_id}.{msg_ts}.{payload}");
    let mut mac = HmacSha256::new_from_slice(trimmed.as_bytes())
        .map_err(|_| crate::error::PolarError::Webhook("invalid secret".to_owned()))?;
    mac.update(to_sign.as_bytes());
    let expected = STANDARD.encode(mac.finalize().into_bytes());

    let valid = signature_values(msg_signature)
        .any(|signature| constant_time_eq(signature.as_bytes(), expected.as_bytes()));

    if !valid {
        return Err(crate::error::PolarError::Webhook(
            "signature invalid".to_owned(),
        ));
    }

    Ok(())
}

fn header_value<'a>(headers: &'a HeaderMap, key: &'static str) -> Option<&'a str> {
    headers.get(key).and_then(|value| value.to_str().ok())
}

fn missing_header(name: &str) -> crate::error::PolarError {
    crate::error::PolarError::Webhook(format!("missing header {name}"))
}

fn verify_timestamp(timestamp: i64) -> Result<()> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| crate::error::PolarError::Webhook("system clock is invalid".to_owned()))?
        .as_secs() as i64;

    if now - timestamp > TOLERANCE_IN_SECONDS {
        return Err(crate::error::PolarError::Webhook(
            "signature timestamp too old".to_owned(),
        ));
    }
    if timestamp > now + TOLERANCE_IN_SECONDS {
        return Err(crate::error::PolarError::Webhook(
            "signature timestamp too far in future".to_owned(),
        ));
    }

    Ok(())
}

fn signature_values(header: &str) -> impl Iterator<Item = &str> {
    header.split_whitespace().filter_map(|part| {
        let signature = part
            .strip_prefix(SIGNATURE_VERSION_COMMA)
            .or_else(|| part.strip_prefix(SIGNATURE_VERSION_EQUALS))?
            .trim_end_matches(',');
        (!signature.is_empty()).then_some(signature)
    })
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    left.iter()
        .zip(right)
        .fold(0_u8, |acc, (left, right)| acc | (left ^ right))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::{HeaderMap, HeaderValue};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn headers(secret: &str, payload: &[u8]) -> HeaderMap {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let to_sign = format!(
            "evt_123.{timestamp}.{}",
            std::str::from_utf8(payload).unwrap()
        );
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(to_sign.as_bytes());
        let signature = format!("v1,{}", STANDARD.encode(mac.finalize().into_bytes()));
        let mut headers = HeaderMap::new();
        headers.insert("webhook-id", HeaderValue::from_static("evt_123"));
        headers.insert(
            "webhook-timestamp",
            HeaderValue::from_str(&timestamp.to_string()).unwrap(),
        );
        headers.insert(
            "webhook-signature",
            HeaderValue::from_str(&signature).unwrap(),
        );
        headers
    }

    #[test]
    fn validates_polar_raw_webhook_secret() {
        let secret = "polar_whs_ovyN6cPrTv56AApvzCaJno08SSmGJmgbWilb33N2JuK";
        let payload = br#"{"type":"order.paid","data":{"id":"order_123"}}"#;

        verify_signature(payload, &headers(secret, payload), secret).unwrap();
    }

    #[test]
    fn rejects_incorrect_polar_raw_webhook_secret() {
        let secret = "polar_whs_ovyN6cPrTv56AApvzCaJno08SSmGJmgbWilb33N2JuK";
        let payload = br#"{"type":"order.paid","data":{"id":"order_123"}}"#;

        assert!(verify_signature(payload, &headers(secret, payload), "polar_whs_wrong").is_err());
    }

    #[test]
    fn accepts_equals_signature_separator() {
        let secret = "polar_whs_ovyN6cPrTv56AApvzCaJno08SSmGJmgbWilb33N2JuK";
        let payload = br#"{"type":"order.paid","data":{"id":"order_123"}}"#;
        let mut headers = headers(secret, payload);
        let signature = headers
            .get("webhook-signature")
            .unwrap()
            .to_str()
            .unwrap()
            .replacen("v1,", "v1=", 1);
        headers.insert(
            "webhook-signature",
            HeaderValue::from_str(&signature).unwrap(),
        );

        verify_signature(payload, &headers, secret).unwrap();
    }
}
