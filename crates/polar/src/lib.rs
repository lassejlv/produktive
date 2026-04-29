//! Async Rust SDK for the [Polar.sh](https://polar.sh) billing API plus
//! Standard Webhooks-compatible signature verification.
//!
//! The hot paths the rest of this workspace cares about — checkouts, customer
//! portal sessions, subscription cancel/resume, and webhook handling — are
//! grouped under [`Polar`] and the [`webhooks`] module respectively.
//!
//! # Quickstart
//!
//! ```no_run
//! use polar_rs::{models::CreateCheckoutRequest, Polar};
//!
//! # async fn run() -> polar_rs::Result<()> {
//! let polar = Polar::new("polar_oat_...")?;
//!
//! let checkout = polar
//!     .checkouts()
//!     .create(CreateCheckoutRequest {
//!         products: vec!["00000000-0000-0000-0000-000000000000".to_owned()],
//!         external_customer_id: Some("org_123".to_owned()),
//!         success_url: Some("https://example.com/success".to_owned()),
//!         ..Default::default()
//!     })
//!     .await?;
//! println!("Redirect to {}", checkout.url);
//! # Ok(())
//! # }
//! ```
//!
//! # Authentication
//!
//! Pass an Organization Access Token (`polar_oat_...`) to [`Polar::new`]. The
//! SDK sends it as `Authorization: Bearer <token>`.
//!
//! # Webhooks
//!
//! Polar uses the [Standard Webhooks](https://www.standardwebhooks.com/) spec.
//! Pass the raw request body plus the three `webhook-*` headers to
//! [`webhooks::verify`] to validate the signature and parse the event in one
//! step.
//!
//! # Cargo features
//!
//! - `tracing` — emit `tracing` debug spans for every HTTP request.

mod client;
mod config;
mod error;

pub mod models;
pub mod resources;
pub mod webhooks;

pub use client::Polar;
pub use config::{PolarConfig, DEFAULT_BASE_URL, SANDBOX_BASE_URL};
pub use error::{ApiError, PolarError, Result};
