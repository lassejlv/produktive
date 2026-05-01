use crate::client::Unkey;
use crate::error::Result;
use crate::models::{
    Empty, LimitRequest, LimitResponse, ListRatelimitOverridesRequest, MultiLimitRequest,
    RatelimitOverride, RatelimitOverrideRequest, SetRatelimitOverrideRequest, UnkeyResponse,
};

/// Ratelimit operations.
#[derive(Debug, Clone)]
pub struct Ratelimit {
    client: Unkey,
}

impl Ratelimit {
    pub(crate) fn new(client: Unkey) -> Self {
        Self { client }
    }

    /// Applies rate limiting to one identifier.
    pub async fn limit(&self, request: LimitRequest) -> Result<UnkeyResponse<LimitResponse>> {
        self.client.post("ratelimit.limit", &request).await
    }

    /// Applies rate limiting to multiple identifiers.
    pub async fn multi_limit(
        &self,
        request: MultiLimitRequest,
    ) -> Result<UnkeyResponse<Vec<LimitResponse>>> {
        self.client.post("ratelimit.multiLimit", &request).await
    }

    /// Sets a rate-limit override for an identifier.
    pub async fn set_override(
        &self,
        request: SetRatelimitOverrideRequest,
    ) -> Result<UnkeyResponse<RatelimitOverride>> {
        self.client.post("ratelimit.setOverride", &request).await
    }

    /// Fetches a rate-limit override.
    pub async fn get_override(
        &self,
        request: RatelimitOverrideRequest,
    ) -> Result<UnkeyResponse<RatelimitOverride>> {
        self.client.post("ratelimit.getOverride", &request).await
    }

    /// Lists rate-limit overrides in a namespace.
    pub async fn list_overrides(
        &self,
        request: ListRatelimitOverridesRequest,
    ) -> Result<UnkeyResponse<Vec<RatelimitOverride>>> {
        self.client.post("ratelimit.listOverrides", &request).await
    }

    /// Deletes a rate-limit override.
    pub async fn delete_override(
        &self,
        request: RatelimitOverrideRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client.post("ratelimit.deleteOverride", &request).await
    }
}
