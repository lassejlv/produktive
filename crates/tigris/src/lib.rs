pub use client::{SharedTigrisClient, TigrisClient, TigrisConfig};
pub use error::TigrisError;
pub use iam::CreatedAccessKey;
pub use regions::{
    lookup_region_label, static_allowed_regions, validate_allowed_region, DeployRegion,
    DEFAULT_OBJECT_STORAGE_REGION,
};
pub use s3::BucketAccess;

mod client;
mod error;
mod iam;
mod regions;
mod s3;
