use crate::client::Unkey;
use crate::error::Result;
use crate::models::{
    CreateIdentityRequest, Empty, Identity, IdentityRequest, ListIdentitiesRequest, UnkeyResponse,
    UpdateIdentityRequest,
};

/// Identity operations.
#[derive(Debug, Clone)]
pub struct Identities {
    client: Unkey,
}

impl Identities {
    pub(crate) fn new(client: Unkey) -> Self {
        Self { client }
    }

    /// Creates an identity for grouping multiple keys.
    pub async fn create_identity(
        &self,
        request: CreateIdentityRequest,
    ) -> Result<UnkeyResponse<Identity>> {
        self.client
            .post("identities.createIdentity", &request)
            .await
    }

    /// Fetches an identity by id or external id.
    pub async fn get_identity(&self, request: IdentityRequest) -> Result<UnkeyResponse<Identity>> {
        self.client.post("identities.getIdentity", &request).await
    }

    /// Updates identity metadata or shared ratelimits.
    pub async fn update_identity(
        &self,
        request: UpdateIdentityRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client
            .post("identities.updateIdentity", &request)
            .await
    }

    /// Deletes an identity.
    pub async fn delete_identity(&self, request: IdentityRequest) -> Result<UnkeyResponse<Empty>> {
        self.client
            .post("identities.deleteIdentity", &request)
            .await
    }

    /// Lists identities.
    pub async fn list_identities(
        &self,
        request: ListIdentitiesRequest,
    ) -> Result<UnkeyResponse<Vec<Identity>>> {
        self.client
            .post("identities.listIdentities", &request)
            .await
    }
}
