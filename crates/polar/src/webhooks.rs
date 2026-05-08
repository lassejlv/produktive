use http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use standardwebhooks::Webhook;

use crate::error::Result;

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
    let base64_result = Webhook::new(trimmed).and_then(|webhook| webhook.verify(payload, headers));
    if base64_result.is_ok() {
        return Ok(());
    }

    Webhook::from_bytes(trimmed.as_bytes().to_vec())?.verify(payload, headers)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::{HeaderMap, HeaderValue};
    use standardwebhooks::Webhook;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn headers(secret: &str, payload: &[u8]) -> HeaderMap {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let webhook = Webhook::from_bytes(secret.as_bytes().to_vec()).unwrap();
        let signature = webhook.sign("evt_123", timestamp, payload).unwrap();
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
}
