//! Top-level fluent builders for the most common operations.
//!
//! These wrap the four "hot path" endpoints with chainable methods that mirror
//! the v1 SDKs' ergonomics. Each builder is constructed via a method on
//! [`Autumn`](crate::Autumn) (`check`, `track`, `attach`, `cancel`) and
//! finished with `.send().await`.
//!
//! For everything else, use the per-namespace resources under
//! [`crate::resources`].

pub mod attach;
pub mod cancel;
pub mod check;
pub mod track;

pub use attach::AttachBuilder;
pub use cancel::CancelBuilder;
pub use check::CheckBuilder;
pub use track::TrackBuilder;
