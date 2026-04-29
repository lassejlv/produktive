//! Per-namespace resource accessors.
//!
//! Each resource is a thin wrapper around the [`Autumn`](crate::Autumn) client
//! that groups related operations. Construct one via the matching method on
//! the client (e.g. `autumn.customers()`) and call methods on the returned
//! struct.

pub mod balances;
pub mod billing;
pub mod customers;
pub mod entities;
pub mod events;
pub mod features;
pub mod plans;
pub mod platform;
pub mod referrals;

pub use balances::Balances;
pub use billing::Billing;
pub use customers::Customers;
pub use entities::Entities;
pub use events::Events;
pub use features::Features;
pub use plans::Plans;
pub use platform::Platform;
pub use referrals::Referrals;
