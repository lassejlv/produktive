//! Cross-cutting types used across multiple namespaces.
//!
//! Includes the dual interval enums ([`ResetInterval`], [`BillingInterval`]),
//! [`BillingControls`] and its sub-types, the [`Lock`] type for reserved
//! balances, and tagged constants ([`BillingCycleAnchorNow`],
//! [`LockEnabled`]) that serialize to specific literal values.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) type Extra = HashMap<String, Value>;

/// Which Autumn environment a resource lives in.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Environment {
    /// Test mode.
    Sandbox,
    /// Production mode.
    Live,
}

impl Environment {
    pub fn as_str(&self) -> &'static str {
        match self {
            Environment::Sandbox => "sandbox",
            Environment::Live => "live",
        }
    }
}

/// Cadence at which a balance resets. Used in `balances.create`,
/// `balances.update`, and plan item resets.
///
/// Distinct from [`BillingInterval`]: this 9-value enum includes sub-day
/// intervals (`minute`, `hour`).
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ResetInterval {
    /// One-off — does not reset.
    OneOff,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    SemiAnnual,
    Year,
}

/// Cadence at which a price recurs. Used on plan base prices and plan item
/// prices.
///
/// Distinct from [`ResetInterval`]: this 6-value enum has no sub-day
/// granularity.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum BillingInterval {
    /// One-off — charged once.
    OneOff,
    Week,
    #[default]
    Month,
    Quarter,
    SemiAnnual,
    Year,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Reset {
    pub interval: ResetInterval,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_count: Option<f64>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct BasePrice {
    pub amount: f64,
    pub interval: BillingInterval,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_count: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct BasePriceResponse {
    pub amount: f64,
    pub interval: BillingInterval,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_count: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<Display>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Display {
    pub primary_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary_text: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct BillingControls {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub auto_topups: Vec<AutoTopup>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spend_limits: Vec<SpendLimit>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub usage_alerts: Vec<UsageAlert>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overage_allowed: Vec<OverageAllowed>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct EntityBillingControls {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spend_limits: Vec<SpendLimit>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub usage_alerts: Vec<UsageAlert>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overage_allowed: Vec<OverageAllowed>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AutoTopup {
    pub feature_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    pub threshold: f64,
    pub quantity: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub purchase_limit: Option<PurchaseLimit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invoice_mode: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PurchaseLimit {
    pub interval: PurchaseLimitInterval,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_count: Option<f64>,
    pub limit: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PurchaseLimitInterval {
    Hour,
    Day,
    Week,
    Month,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct SpendLimit {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overage_limit: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct UsageAlert {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    pub threshold: f64,
    pub threshold_type: ThresholdType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ThresholdType {
    Usage,
    UsagePercentage,
    Remaining,
    RemainingPercentage,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct OverageAllowed {
    pub feature_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

/// Reserves balance up front during a `check` or `track` call.
///
/// Pass via [`CheckBuilder::lock`](crate::builders::CheckBuilder::lock) or
/// [`TrackBuilder::lock`](crate::builders::TrackBuilder::lock); finalize the
/// reservation later with
/// [`Balances::finalize`](crate::resources::Balances::finalize) using either
/// `confirm` (commit the deduction) or `release` (return the held balance).
///
/// ```no_run
/// use autumn_rs::models::Lock;
/// let lock = Lock::new("lock_abc").expires_at(1_700_000_000_000);
/// ```
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Lock {
    /// Caller-supplied identifier; used later when finalizing.
    pub lock_id: String,
    /// Always `true` on the wire. The marker type prevents accidental misuse.
    pub enabled: LockEnabled,
    /// Optional expiry (unix epoch milliseconds). After expiry the held balance
    /// is automatically released.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
}

impl Lock {
    /// Creates a new lock with the given id and no expiry.
    pub fn new(lock_id: impl Into<String>) -> Self {
        Self {
            lock_id: lock_id.into(),
            enabled: LockEnabled,
            expires_at: None,
        }
    }

    /// Sets an absolute expiry timestamp (unix epoch milliseconds).
    pub fn expires_at(mut self, expires_at: i64) -> Self {
        self.expires_at = Some(expires_at);
        self
    }
}

/// Marker that always serializes as the JSON literal `true`.
///
/// Autumn's API rejects locks with `enabled: false`, so we encode this as a
/// type-level constant rather than a `bool`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LockEnabled;

impl Serialize for LockEnabled {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bool(true)
    }
}

/// Response body for endpoints that just acknowledge success.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct SuccessResponse {
    /// `true` when the operation succeeded.
    pub success: bool,
}

/// Filters that accept either one feature id or many. Serializes as a bare
/// string for [`One`](Self::One) and as an array for [`Many`](Self::Many).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum FeatureIdFilter {
    /// Single feature id.
    One(String),
    /// Multiple feature ids.
    Many(Vec<String>),
}

/// Inclusive timestamp range (unix epoch milliseconds) for events queries.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct CustomRange {
    /// Start timestamp (ms epoch).
    pub start: i64,
    /// End timestamp (ms epoch).
    pub end: i64,
}

/// Marker that always serializes as the JSON string `"now"`.
///
/// Autumn's `billing_cycle_anchor` field only accepts that one value; this
/// type encodes that constraint at compile time.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BillingCycleAnchorNow;

impl Serialize for BillingCycleAnchorNow {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("now")
    }
}

impl<'de> Deserialize<'de> for BillingCycleAnchorNow {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        if value == "now" {
            Ok(BillingCycleAnchorNow)
        } else {
            Err(serde::de::Error::invalid_value(
                serde::de::Unexpected::Str(&value),
                &"\"now\"",
            ))
        }
    }
}
