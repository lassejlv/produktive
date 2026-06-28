//! Provider-neutral deployment domain for Produktive.
//!
//! This crate owns the product vocabulary: services, deployments, normalized
//! states, provider requests, observability shapes, and secret encryption. Cloud
//! adapters such as `crates/fly` implement the [`DeployProvider`] trait without
//! leaking provider-specific APIs into `crates/api`.

pub mod crypto;
pub mod error;
pub mod model;
pub mod provider;
pub mod regions;
pub mod state;

pub use crypto::SecretCipher;
pub use error::{DeployError, DeployResult};
pub use model::*;
pub use provider::*;
pub use regions::{
    catalog_from_fly, cloud_run_region, lookup_region_label, region_flag, static_allowed_regions,
    validate_allowed_region, DeployRegion, FlyPlatformRegion, ALLOWED_REGION_CODES,
    DEFAULT_DEPLOY_REGION,
};
pub use state::DeploymentStatus;
