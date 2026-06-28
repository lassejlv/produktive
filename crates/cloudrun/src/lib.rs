//! Google Cloud Run (v2 Admin API) provider for Produktive Deployments.
//!
//! Mirrors `crates/fly`: a thin typed [`CloudRun`] client plus a
//! [`CloudRunProvider`] that implements `deploy::DeployProvider`. Cloud Run is
//! stateless — it rejects volume specs — and serves each service from a
//! managed `*.run.app` URL. Authentication uses a Google service-account key,
//! minting short-lived OAuth access tokens via the JWT-bearer flow.

mod auth;
mod client;
mod models;
mod provider;

pub use auth::ServiceAccountKey;
pub use client::{CloudRun, CloudRunConfig};
pub use provider::CloudRunProvider;
