use crate::client::Unkey;
use crate::error::Result;
use crate::models::{
    CreateKeyRequest, CreateKeyResponse, Empty, Key, KeyIdRequest, KeyPermissionsRequest,
    KeyRolesRequest, MigrateKeysRequest, MigrateKeysResponse, RerollKeyResponse, UnkeyResponse,
    UpdateCreditsRequest, UpdateKeyRequest, VerifyKeyRequest, VerifyKeyResponse,
};

/// API key operations.
#[derive(Debug, Clone)]
pub struct Keys {
    client: Unkey,
}

impl Keys {
    pub(crate) fn new(client: Unkey) -> Self {
        Self { client }
    }

    /// Creates a new API key. The plaintext key is returned only once.
    pub async fn create_key(
        &self,
        request: CreateKeyRequest,
    ) -> Result<UnkeyResponse<CreateKeyResponse>> {
        self.client.post("keys.createKey", &request).await
    }

    /// Verifies an API key and can apply permission, credit, and rate-limit checks.
    pub async fn verify_key(
        &self,
        request: VerifyKeyRequest,
    ) -> Result<UnkeyResponse<VerifyKeyResponse>> {
        self.client.post("keys.verifyKey", &request).await
    }

    /// Partially updates an API key.
    pub async fn update_key(&self, request: UpdateKeyRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.updateKey", &request).await
    }

    /// Deletes an API key.
    pub async fn delete_key(&self, request: KeyIdRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.deleteKey", &request).await
    }

    /// Fetches an API key by id.
    pub async fn get_key(&self, request: KeyIdRequest) -> Result<UnkeyResponse<Key>> {
        self.client.post("keys.getKey", &request).await
    }

    /// Adds direct permissions to a key.
    pub async fn add_permissions(
        &self,
        request: KeyPermissionsRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.addPermissions", &request).await
    }

    /// Removes direct permissions from a key.
    pub async fn remove_permissions(
        &self,
        request: KeyPermissionsRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.removePermissions", &request).await
    }

    /// Replaces direct permissions on a key.
    pub async fn set_permissions(
        &self,
        request: KeyPermissionsRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.setPermissions", &request).await
    }

    /// Adds roles to a key.
    pub async fn add_roles(&self, request: KeyRolesRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.addRoles", &request).await
    }

    /// Removes roles from a key.
    pub async fn remove_roles(&self, request: KeyRolesRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.removeRoles", &request).await
    }

    /// Replaces roles on a key.
    pub async fn set_roles(&self, request: KeyRolesRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.setRoles", &request).await
    }

    /// Updates a key's credit balance.
    pub async fn update_credits(
        &self,
        request: UpdateCreditsRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client.post("keys.updateCredits", &request).await
    }

    /// Rerolls a key and returns the new plaintext key.
    pub async fn reroll_key(
        &self,
        request: KeyIdRequest,
    ) -> Result<UnkeyResponse<RerollKeyResponse>> {
        self.client.post("keys.rerollKey", &request).await
    }

    /// Fetches the key identified by the supplied hash-bearing token.
    pub async fn whoami(&self, request: VerifyKeyRequest) -> Result<UnkeyResponse<Key>> {
        self.client.post("keys.whoami", &request).await
    }

    /// Imports externally generated key hashes into an API namespace.
    pub async fn migrate_keys(
        &self,
        request: MigrateKeysRequest,
    ) -> Result<UnkeyResponse<MigrateKeysResponse>> {
        self.client.post("keys.migrateKeys", &request).await
    }
}
