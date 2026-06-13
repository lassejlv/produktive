//! Rust SDK for the Autumn API.
//!
//! The crate exposes a typed async client for server-side billing, usage,
//! feature-gating, customer, entity, plan, referral, platform, and webhook
//! workflows. Enable the `axum` feature for a secure backend handler that can
//! support frontend billing pages without exposing an Autumn secret key.

pub mod balances;
pub mod billing;
pub mod client;
pub mod customers;
pub mod entities;
pub mod error;
pub mod events;
pub mod features;
pub mod models;
pub mod plans;
pub mod platform;
pub mod referrals;
pub mod webhooks;

#[cfg(feature = "axum")]
pub mod axum;

pub use balances::*;
pub use billing::*;
pub use client::{Autumn, AutumnBuilder};
pub use customers::*;
pub use entities::*;
pub use error::{ApiError, AutumnError, Result};
pub use events::*;
pub use features::*;
pub use models::*;
pub use plans::*;
pub use platform::*;
pub use referrals::*;
pub use webhooks::*;
