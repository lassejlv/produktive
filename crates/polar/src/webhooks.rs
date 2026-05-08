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
    Webhook::new(secret)?.verify(payload, headers)?;
    Ok(serde_json::from_slice(payload)?)
}
