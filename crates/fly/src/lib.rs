//! Fly.io Machines provider for Produktive Deployments.

mod client;
mod models;
mod provider;

pub use client::{fetch_platform_regions, Fly, FlyBuilder, FlyConfig};
pub use provider::FlyProvider;
