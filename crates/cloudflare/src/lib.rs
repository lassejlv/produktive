//! Minimal typed async client for the [Cloudflare](https://cloudflare.com) API.
//!
//! Covers the slice `produktive` needs to manage Cloudflare for SaaS custom
//! hostnames: creating, fetching, and deleting custom hostnames, setting the
//! fallback origin, and reading the zone's DCV delegation UUID. It is a thin
//! REST wrapper with no dependency on the API crate.
//!
//! Cloudflare wraps every response in an `{ success, errors, result }`
//! envelope; [`models::CfEnvelope::into_result`] unwraps it, returning the
//! `result` on success or mapping the first error to [`error::CloudflareError::Api`].

pub mod client;
pub mod error;
pub mod models;

pub use client::Cloudflare;
pub use error::{CloudflareError, Result};
pub use models::{CfApiError, CfEnvelope, CustomHostname, CustomHostnameSsl};
