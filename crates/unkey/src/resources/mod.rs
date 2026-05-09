mod apis;
mod identities;
mod keys;
mod permissions;
mod ratelimit;

pub use apis::Apis;
pub use identities::Identities;
pub use keys::Keys;
pub use permissions::Permissions;
pub use ratelimit::Ratelimit;

use crate::client::Unkey;

impl Unkey {
    /// API namespace operations.
    pub fn apis(&self) -> Apis {
        Apis::new(self.clone())
    }

    /// API key operations.
    pub fn keys(&self) -> Keys {
        Keys::new(self.clone())
    }

    /// Identity operations.
    pub fn identities(&self) -> Identities {
        Identities::new(self.clone())
    }

    /// RBAC permission and role operations.
    pub fn permissions(&self) -> Permissions {
        Permissions::new(self.clone())
    }

    /// Ratelimit operations.
    pub fn ratelimit(&self) -> Ratelimit {
        Ratelimit::new(self.clone())
    }
}
