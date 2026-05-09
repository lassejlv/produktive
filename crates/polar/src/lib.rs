//! Minimal async Rust SDK for the [Polar](https://polar.sh) API.
//!
//! This crate intentionally stays small: it provides an authenticated async
//! `reqwest` client, JSON-first resource helpers, webhook validation, and a
//! typed escape hatch through `request_json`.
//!
//! ```no_run
//! use polar_rs::Polar;
//! use serde_json::json;
//!
//! # async fn run() -> polar_rs::Result<()> {
//! let polar = Polar::new("polar_oat_...")?;
//! let products = polar.products().list(&json!({ "organization_id": "org_..." })).await?;
//! let checkout = polar
//!     .checkouts()
//!     .create(&json!({ "products": ["prod_..."] }))
//!     .await?;
//! # Ok(())
//! # }
//! ```

mod client;
mod config;
mod error;
mod resources;

pub mod webhooks;

pub use client::Polar;
pub use config::{PolarConfig, Server, DEFAULT_PRODUCTION_URL, DEFAULT_SANDBOX_URL};
pub use error::{ApiError, PolarError, Result};
pub use resources::*;

pub type JsonValue = serde_json::Value;
