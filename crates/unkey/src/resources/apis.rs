use crate::client::Unkey;
use crate::error::Result;
use crate::models::{
    Api, ApiIdRequest, CreateApiRequest, Empty, Key, ListKeysRequest, UnkeyResponse,
};

/// API namespace operations.
#[derive(Debug, Clone)]
pub struct Apis {
    client: Unkey,
}

impl Apis {
    pub(crate) fn new(client: Unkey) -> Self {
        Self { client }
    }

    /// Creates an API namespace.
    pub async fn create_api(&self, request: CreateApiRequest) -> Result<UnkeyResponse<Api>> {
        self.client.post("apis.createApi", &request).await
    }

    /// Deletes an API namespace and invalidates its keys.
    pub async fn delete_api(&self, request: ApiIdRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("apis.deleteApi", &request).await
    }

    /// Fetches an API namespace.
    pub async fn get_api(&self, request: ApiIdRequest) -> Result<UnkeyResponse<Api>> {
        self.client.post("apis.getApi", &request).await
    }

    /// Lists keys in an API namespace.
    pub async fn list_keys(&self, request: ListKeysRequest) -> Result<UnkeyResponse<Vec<Key>>> {
        self.client.post("apis.listKeys", &request).await
    }
}
