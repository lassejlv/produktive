//! Polar webhook verification and event types.
//!
//! Polar follows the [Standard Webhooks](https://www.standardwebhooks.com/)
//! spec: each request carries `webhook-id`, `webhook-timestamp`, and
//! `webhook-signature` headers. The signed payload is
//! `{webhook_id}.{webhook_timestamp}.{body}`, HMAC-SHA256 with the webhook
//! secret as the key, base64-encoded, and prefixed with `v1,` in the
//! signature header. Multiple signatures may be space-separated to support
//! key rotation.
//!
//! # Note on the secret
//!
//! Polar's SDKs treat the webhook secret as a **plain UTF-8 string** — the
//! HMAC key is `secret.as_bytes()` directly, not the base64-decoded value of
//! a `whsec_` prefix. This implementation matches that convention.
//!
//! # Example
//!
//! ```no_run
//! use polar_rs::webhooks::{verify, WebhookEvent};
//!
//! # fn handle(body: &[u8], wid: &str, ts: &str, sig: &str, secret: &str)
//! # -> Result<(), polar_rs::webhooks::WebhookError> {
//! match verify(body, wid, ts, sig, secret)? {
//!     WebhookEvent::SubscriptionActive(sub) => println!("active: {}", sub.id),
//!     WebhookEvent::SubscriptionCanceled(sub) => println!("canceled: {}", sub.id),
//!     _ => {}
//! }
//! # Ok(())
//! # }
//! ```

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use serde::de::{self, Deserializer};
use serde::Deserialize;
use serde_json::Value;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

use crate::models::{Customer, Subscription};

type HmacSha256 = Hmac<Sha256>;

/// Maximum acceptable drift between the webhook timestamp and the local clock,
/// matching the Standard Webhooks spec.
pub const TOLERANCE_SECONDS: i64 = 5 * 60;

/// Errors that can occur while verifying a webhook payload.
#[derive(Debug, Error)]
pub enum WebhookError {
    #[error("missing webhook header: {0}")]
    MissingHeader(&'static str),
    #[error("invalid webhook timestamp")]
    InvalidTimestamp,
    #[error("webhook timestamp outside tolerance")]
    TimestampOutOfTolerance,
    #[error("no v1 signature found in webhook-signature header")]
    NoSupportedSignature,
    #[error("signature mismatch")]
    SignatureMismatch,
    #[error("invalid signing key")]
    InvalidKey,
    #[error("invalid payload: {0}")]
    InvalidPayload(#[from] serde_json::Error),
}

/// Verifies a Polar webhook signature and parses the event in one step.
///
/// `body` must be the **exact bytes** Polar sent — re-serializing the JSON
/// will reorder keys and break the signature.
///
/// `secret` is the webhook signing secret you configured in Polar; it's used
/// directly as the HMAC-SHA256 key (Polar treats it as a plain UTF-8 string).
///
/// Returns the parsed event on success. Unknown or unmodeled event types are
/// returned as [`WebhookEvent::Other`].
pub fn verify(
    body: &[u8],
    webhook_id: &str,
    webhook_timestamp: &str,
    webhook_signature: &str,
    secret: &str,
) -> Result<WebhookEvent, WebhookError> {
    verify_at(
        body,
        webhook_id,
        webhook_timestamp,
        webhook_signature,
        secret,
        current_unix_seconds(),
    )
}

/// Same as [`verify`], but uses `now_unix_seconds` as the reference time —
/// useful in tests that want to simulate clock drift without sleeping.
pub fn verify_at(
    body: &[u8],
    webhook_id: &str,
    webhook_timestamp: &str,
    webhook_signature: &str,
    secret: &str,
    now_unix_seconds: i64,
) -> Result<WebhookEvent, WebhookError> {
    if webhook_id.is_empty() {
        return Err(WebhookError::MissingHeader("webhook-id"));
    }
    if webhook_timestamp.is_empty() {
        return Err(WebhookError::MissingHeader("webhook-timestamp"));
    }
    if webhook_signature.is_empty() {
        return Err(WebhookError::MissingHeader("webhook-signature"));
    }

    let timestamp: i64 = webhook_timestamp
        .parse()
        .map_err(|_| WebhookError::InvalidTimestamp)?;
    if (now_unix_seconds - timestamp).abs() > TOLERANCE_SECONDS {
        return Err(WebhookError::TimestampOutOfTolerance);
    }

    let mut signed = Vec::with_capacity(webhook_id.len() + webhook_timestamp.len() + body.len() + 2);
    signed.extend_from_slice(webhook_id.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(webhook_timestamp.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(body);

    let mut had_v1 = false;
    let mut matched = false;
    for entry in webhook_signature.split_whitespace() {
        let Some((version, value)) = entry.split_once(',') else {
            continue;
        };
        if version != "v1" {
            continue;
        }
        had_v1 = true;
        let decoded = match BASE64.decode(value) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
            .map_err(|_| WebhookError::InvalidKey)?;
        mac.update(&signed);
        if mac.verify_slice(&decoded).is_ok() {
            matched = true;
            break;
        }
    }
    if !had_v1 {
        return Err(WebhookError::NoSupportedSignature);
    }
    if !matched {
        return Err(WebhookError::SignatureMismatch);
    }

    let event: WebhookEvent = serde_json::from_slice(body)?;
    Ok(event)
}

fn current_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Polar webhook event envelope, discriminated by the top-level `type` field.
///
/// Events the workspace doesn't model are folded into [`WebhookEvent::Other`]
/// with their original tag and untouched `data` value.
#[derive(Debug, Clone)]
pub enum WebhookEvent {
    SubscriptionCreated(Subscription),
    SubscriptionUpdated(Subscription),
    SubscriptionActive(Subscription),
    SubscriptionCanceled(Subscription),
    SubscriptionUncanceled(Subscription),
    SubscriptionRevoked(Subscription),
    SubscriptionPastDue(Subscription),
    CustomerCreated(Customer),
    CustomerUpdated(Customer),
    CustomerDeleted(Customer),
    CustomerStateChanged(Value),
    Other { event_type: String, data: Value },
}

impl<'de> Deserialize<'de> for WebhookEvent {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Envelope {
            #[serde(rename = "type")]
            event_type: String,
            data: Value,
        }

        let envelope = Envelope::deserialize(deserializer)?;

        let parse_subscription = |data: Value| -> Result<Subscription, D::Error> {
            serde_json::from_value(data).map_err(de::Error::custom)
        };
        let parse_customer = |data: Value| -> Result<Customer, D::Error> {
            serde_json::from_value(data).map_err(de::Error::custom)
        };

        Ok(match envelope.event_type.as_str() {
            "subscription.created" => Self::SubscriptionCreated(parse_subscription(envelope.data)?),
            "subscription.updated" => Self::SubscriptionUpdated(parse_subscription(envelope.data)?),
            "subscription.active" => Self::SubscriptionActive(parse_subscription(envelope.data)?),
            "subscription.canceled" => Self::SubscriptionCanceled(parse_subscription(envelope.data)?),
            "subscription.uncanceled" => {
                Self::SubscriptionUncanceled(parse_subscription(envelope.data)?)
            }
            "subscription.revoked" => Self::SubscriptionRevoked(parse_subscription(envelope.data)?),
            "subscription.past_due" => {
                Self::SubscriptionPastDue(parse_subscription(envelope.data)?)
            }
            "customer.created" => Self::CustomerCreated(parse_customer(envelope.data)?),
            "customer.updated" => Self::CustomerUpdated(parse_customer(envelope.data)?),
            "customer.deleted" => Self::CustomerDeleted(parse_customer(envelope.data)?),
            "customer.state_changed" => Self::CustomerStateChanged(envelope.data),
            _ => Self::Other {
                event_type: envelope.event_type,
                data: envelope.data,
            },
        })
    }
}

impl WebhookEvent {
    /// Returns the embedded subscription for any `subscription.*` variant.
    pub fn as_subscription(&self) -> Option<&Subscription> {
        match self {
            Self::SubscriptionCreated(sub)
            | Self::SubscriptionUpdated(sub)
            | Self::SubscriptionActive(sub)
            | Self::SubscriptionCanceled(sub)
            | Self::SubscriptionUncanceled(sub)
            | Self::SubscriptionRevoked(sub)
            | Self::SubscriptionPastDue(sub) => Some(sub),
            _ => None,
        }
    }

    /// Returns true for `subscription.revoked` — the subscription is gone and
    /// the customer's access should be removed.
    pub fn is_subscription_terminated(&self) -> bool {
        matches!(self, Self::SubscriptionRevoked(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(secret: &str, id: &str, ts: &str, body: &[u8]) -> String {
        let mut signed = Vec::new();
        signed.extend_from_slice(id.as_bytes());
        signed.push(b'.');
        signed.extend_from_slice(ts.as_bytes());
        signed.push(b'.');
        signed.extend_from_slice(body);
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(&signed);
        let digest = mac.finalize().into_bytes();
        format!("v1,{}", BASE64.encode(digest))
    }

    #[test]
    fn verifies_a_well_formed_signature() {
        let secret = "supersecret";
        let id = "msg_123";
        let ts = "1717171717";
        let body = br#"{"type":"subscription.active","data":{"id":"sub_1","status":"active"}}"#;
        let sig = sign(secret, id, ts, body);

        let event = verify_at(body, id, ts, &sig, secret, 1717171717).unwrap();
        assert!(matches!(event, WebhookEvent::SubscriptionActive(_)));
    }

    #[test]
    fn rejects_a_bad_signature() {
        let secret = "supersecret";
        let id = "msg_123";
        let ts = "1717171717";
        let body = br#"{"type":"subscription.active","data":{"id":"sub_1","status":"active"}}"#;
        let bad = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

        let err = verify_at(body, id, ts, bad, secret, 1717171717).unwrap_err();
        assert!(matches!(err, WebhookError::SignatureMismatch));
    }

    #[test]
    fn rejects_old_timestamps() {
        let secret = "supersecret";
        let id = "msg_123";
        let ts = "1717171717";
        let body = b"{}";
        let sig = sign(secret, id, ts, body);

        let err = verify_at(body, id, ts, &sig, secret, 1717171717 + 600).unwrap_err();
        assert!(matches!(err, WebhookError::TimestampOutOfTolerance));
    }

    #[test]
    fn picks_a_matching_signature_among_multiple() {
        let secret = "supersecret";
        let id = "msg_123";
        let ts = "1717171717";
        let body = br#"{"type":"customer.created","data":{"id":"c1"}}"#;
        let good = sign(secret, id, ts, body);
        let combined = format!("v1,AAAA= {good}");

        let event = verify_at(body, id, ts, &combined, secret, 1717171717).unwrap();
        assert!(matches!(event, WebhookEvent::CustomerCreated(_)));
    }

    #[test]
    fn unknown_event_type_falls_back_to_other() {
        let secret = "supersecret";
        let id = "msg_123";
        let ts = "1717171717";
        let body = br#"{"type":"order.refunded","data":{"id":"ord_1"}}"#;
        let sig = sign(secret, id, ts, body);

        let event = verify_at(body, id, ts, &sig, secret, 1717171717).unwrap();
        match event {
            WebhookEvent::Other { event_type, data } => {
                assert_eq!(event_type, "order.refunded");
                assert_eq!(data["id"], "ord_1");
            }
            _ => panic!("expected Other"),
        }
    }
}
