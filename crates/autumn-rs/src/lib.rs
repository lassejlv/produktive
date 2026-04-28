//! Async Rust SDK for the [Autumn](https://useautumn.com) Billing API.
//!
//! Targets Autumn API **v2.2.0**. Every core operation is `POST` to a
//! dot-namespaced path under `/v1/` (e.g. `/v1/balances.check`,
//! `/v1/customers.list`, `/v1/billing.attach`); the platform sub-API uses
//! standard REST verbs.
//!
//! # Quickstart
//!
//! ```no_run
//! use autumn_rs::Autumn;
//!
//! # async fn example() -> autumn_rs::Result<()> {
//! let autumn = Autumn::new("am_sk_test_...")?;
//!
//! let check = autumn.check("customer_123").feature("messages").send().await?;
//! if check.allowed {
//!     autumn
//!         .track("customer_123")
//!         .feature("messages")
//!         .value(1.0)
//!         .send()
//!         .await?;
//! }
//! # Ok(())
//! # }
//! ```
//!
//! # Authentication
//!
//! Pass your Autumn secret key (`am_sk_test_...` or `am_sk_live_...`) to
//! [`Autumn::new`]. The SDK sets `Authorization: Bearer <key>` and
//! `X-Api-Version: 2.2.0` on every request.
//!
//! # Surface
//!
//! Hot paths are exposed as top-level builders on [`Autumn`]:
//!
//! - [`Autumn::check`] — verify whether a customer can use a feature
//! - [`Autumn::track`] — record usage
//! - [`Autumn::attach`] — start a subscription, upgrade, or downgrade
//! - [`Autumn::cancel`] — cancel or uncancel a subscription
//!
//! Everything else is grouped under per-namespace resource accessors:
//!
//! | Accessor | What it manages |
//! | --- | --- |
//! | [`Autumn::balances`] | Per-feature balance create / update / delete / lock finalize |
//! | [`Autumn::billing`] | Direct (non-builder) attach, multi-attach, preview, update, setup-payment, customer portal |
//! | [`Autumn::customers`] | List / get-or-create / update / delete |
//! | [`Autumn::entities`] | Sub-customer entities (e.g. seats, workspaces) |
//! | [`Autumn::events`] | List and aggregate raw usage events |
//! | [`Autumn::features`] | Feature CRUD |
//! | [`Autumn::plans`] | Plan CRUD (v2's name for what v1 called "products") |
//! | [`Autumn::referrals`] | Create and redeem referral codes |
//! | [`Autumn::platform`] | Multi-tenant platform API (Beta) |
//!
//! # Concepts
//!
//! - **Plan** — a billable product with feature allowances and pricing.
//!   In v1 these were called "products"; v2 renamed them.
//! - **Subscription** vs **Purchase** — a [`Customer`](models::Customer) carries
//!   `subscriptions` (recurring) and `purchases` (one-off). Both reference a
//!   plan and a quantity.
//! - **Feature** vs **FeatureRef** — Autumn ships two feature schemas. A
//!   stand-alone [`Feature`](models::Feature) has a 3-value `type` (`boolean`,
//!   `metered`, `credit_system`). When embedded inside a plan item the schema
//!   is [`FeatureRef`](models::FeatureRef) with a 5-value `type` that adds
//!   `static` / `single_use` / `continuous_use`. They are intentionally distinct.
//! - **Reset interval** vs **billing interval** — balances reset on a 9-value
//!   [`ResetInterval`](models::ResetInterval) (includes `minute` / `hour` /
//!   `day`); plan prices use the 6-value [`BillingInterval`](models::BillingInterval)
//!   (no sub-day intervals).
//! - **Locks** — pass a [`Lock`](models::Lock) to `check` or `track` to reserve
//!   balance up front, then commit or release it via
//!   [`Balances::finalize`](resources::Balances::finalize).
//!
//! # Errors
//!
//! All operations return [`Result<T, AutumnError>`]. The most useful variant is
//! [`AutumnError::Api`], which exposes the HTTP status, Autumn error code, and
//! the raw JSON body for debugging.
//!
//! # Configuration
//!
//! ```no_run
//! use std::time::Duration;
//! use autumn_rs::{Autumn, AutumnConfig};
//!
//! # fn build() -> autumn_rs::Result<Autumn> {
//! let autumn = Autumn::with_config(
//!     AutumnConfig::new("am_sk_test_...")
//!         .timeout(Duration::from_secs(10))
//!         .max_retries(3)
//!         .user_agent("my-service/1.0"),
//! )?;
//! # Ok(autumn)
//! # }
//! ```
//!
//! # Cargo features
//!
//! - `tracing` — emit `tracing` debug spans for every request.
//!
//! # Versioning
//!
//! This crate targets Autumn API v2.2.0. The `X-Api-Version` header value is
//! set via [`AutumnConfig::api_version`] if you need to pin a different
//! revision.

mod client;
mod config;
mod error;

/// Helpers for assembling query strings on REST-style endpoints.
pub mod request;

pub mod builders;
pub mod models;
pub mod resources;

pub use client::Autumn;
pub use config::{AutumnConfig, DEFAULT_API_VERSION, DEFAULT_BASE_URL};
pub use error::{ApiError, AutumnError, Result};
