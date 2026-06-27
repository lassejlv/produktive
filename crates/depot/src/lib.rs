//! Depot.dev build provider for Produktive Deployments.
//!
//! Turns a public GitHub source ([`deploy::BuildSpec`]) into a pushed image,
//! implementing the provider-neutral [`deploy::BuildProvider`] trait so the build
//! engine stays swappable — the mirror of how `crates/fly` implements
//! [`deploy::DeployProvider`].
//!
//! There is no Rust SDK for Depot (only Go), so this adapter shells out to the
//! `depot` CLI on the host. Two build paths share one Depot project + cache:
//!
//! - **Dockerfile** (`depot build -t <ref> --push <ctx>`) — the blessed, exact path.
//! - **Railpack** (`railpack prepare` → `depot exec -- buildctl build` with the
//!   `gateway.v0` Railpack frontend) — used when no Dockerfile is present. This
//!   path depends on `depot exec` exposing a BuildKit endpoint; see
//!   [`provider`] for the runtime caveat.
//!
//! The host running this (the `deploy-worker` service) must have `depot`, `git`,
//! and — for the Railpack path — `railpack` and `buildctl` on `PATH`.

mod config;
mod provider;

pub use config::{
    DepotConfig, DEFAULT_PLATFORM, DEFAULT_RAILPACK_FRONTEND, DEFAULT_REGISTRY_USERNAME,
};
pub use provider::DepotProvider;
