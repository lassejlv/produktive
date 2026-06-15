//! Minimal typed async client for the [Polar](https://polar.sh) billing API.
//!
//! Covers the server-side surface `produktive` needs to gate features, meter
//! usage, run checkout, and open the customer portal: customers + customer
//! state, event ingestion, checkout sessions, customer sessions, subscriptions,
//! and a read-only product catalog loader. It is a thin REST wrapper — a pure
//! pipeline with no dependency on the API crate.
//!
//! Two Polar-specific quirks are handled here so callers don't have to:
//! - a real `User-Agent` is always sent (Polar's edge rejects blank/bot UAs), and
//! - `organization_id` is never sent in request bodies (organization-scoped
//!   tokens reject it — the org is inferred from the token).

pub mod catalog;
pub mod checkouts;
pub mod client;
pub mod customer_sessions;
pub mod customers;
pub mod error;
pub mod events;
pub mod models;
pub mod subscriptions;

pub use catalog::*;
pub use checkouts::*;
pub use client::{Polar, PolarBuilder};
pub use customer_sessions::*;
pub use customers::*;
pub use error::{ApiError, PolarError, Result};
pub use events::*;
pub use models::*;
pub use subscriptions::*;
