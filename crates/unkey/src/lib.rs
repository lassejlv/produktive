//! Async Rust SDK for the [Unkey](https://www.unkey.com) v2 API.
//!
//! The public surface follows the official TypeScript SDK's resource layout,
//! but uses idiomatic Rust method names:
//!
//! ```no_run
//! use unkey_rs::{models::CreateKeyRequest, Unkey};
//!
//! # async fn run() -> unkey_rs::Result<()> {
//! let unkey = Unkey::new("unkey_root_...")?;
//!
//! let result = unkey
//!     .keys()
//!     .create_key(CreateKeyRequest {
//!         api_id: "api_123".to_owned(),
//!         name: Some("Production key".to_owned()),
//!         prefix: Some("prod".to_owned()),
//!         ..Default::default()
//!     })
//!     .await?;
//!
//! println!("Created key {}", result.data.key);
//! # Ok(())
//! # }
//! ```
//!
//! # Mapping from TypeScript
//!
//! - `unkey.apis.createApi(...)` -> `unkey.apis().create_api(...).await`
//! - `unkey.keys.verifyKey(...)` -> `unkey.keys().verify_key(...).await`
//! - `unkey.ratelimit.limit(...)` -> `unkey.ratelimit().limit(...).await`

mod client;
mod config;
mod error;

pub mod models;
pub mod resources;

pub use client::Unkey;
pub use config::{UnkeyConfig, DEFAULT_BASE_URL};
pub use error::{ApiError, Result, UnkeyError};
