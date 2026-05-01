//! Request and response shapes for the Unkey v2 API.
//!
//! The structs use Rust field names and serde camelCase conversion so JSON
//! matches the official TypeScript SDK and v2 RPC API.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub type Metadata = HashMap<String, Value>;

/// Common Unkey response envelope.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnkeyResponse<T> {
    #[serde(default)]
    pub meta: ResponseMeta,
    pub data: T,
    #[serde(default)]
    pub pagination: Option<Pagination>,
}

/// Request metadata returned by Unkey.
#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseMeta {
    #[serde(default)]
    pub request_id: Option<String>,
}

/// Pagination metadata returned by list endpoints.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub has_more: bool,
}

/// Empty `{}` response data.
#[derive(Debug, Default, Clone, Deserialize)]
pub struct Empty {}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatelimitConfig {
    pub name: String,
    pub limit: u64,
    pub duration: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_apply: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatelimitState {
    pub name: String,
    pub limit: u64,
    pub remaining: i64,
    pub reset: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credits {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refill: Option<CreditRefill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditRefill {
    pub amount: i64,
    pub interval: CreditRefillInterval,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refill_day: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CreditRefillInterval {
    Daily,
    Monthly,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditCost {
    pub cost: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CreditOperation {
    Set,
    Increment,
    Decrement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityRef {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum PermissionCheck {
    One(String),
    Many(Vec<String>),
}

impl From<String> for PermissionCheck {
    fn from(value: String) -> Self {
        Self::One(value)
    }
}

impl From<&str> for PermissionCheck {
    fn from(value: &str) -> Self {
        Self::One(value.to_owned())
    }
}

impl From<Vec<String>> for PermissionCheck {
    fn from(value: Vec<String>) -> Self {
        Self::Many(value)
    }
}

// ---------------------------------------------------------------------------
// APIs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiIdRequest {
    pub api_id: String,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListKeysRequest {
    pub api_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Api {
    #[serde(default, alias = "id")]
    pub api_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKeyRequest {
    pub api_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub byte_length: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub meta: Metadata,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub roles: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<Credits>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratelimits: Vec<RatelimitConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<IdentityRef>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyIdRequest {
    pub key_id: String,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyKeyRequest {
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<PermissionCheck>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratelimits: Vec<RatelimitConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<CreditCost>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKeyRequest {
    pub key_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<Credits>,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub meta: Metadata,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub roles: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratelimits: Vec<RatelimitConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyPermissionsRequest {
    pub key_id: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyRolesRequest {
    pub key_id: String,
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCreditsRequest {
    pub key_id: String,
    pub value: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation: Option<CreditOperation>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateKeysRequest {
    pub migration_id: String,
    pub api_id: String,
    pub keys: Vec<MigrateKey>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateKey {
    pub hash: MigrateKeyHash,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub meta: Metadata,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub roles: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratelimits: Vec<RatelimitConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<Credits>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateKeyHash {
    pub value: String,
    pub variant: MigrateKeyHashVariant,
}

impl Default for MigrateKeyHash {
    fn default() -> Self {
        Self {
            value: String::new(),
            variant: MigrateKeyHashVariant::Sha256Hex,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MigrateKeyHashVariant {
    Sha256Hex,
    Sha256Base64,
    Bcrypt,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateKeysResponse {
    #[serde(default)]
    pub migrated: Vec<MigratedKey>,
    #[serde(default)]
    pub failed: Vec<FailedMigratedKey>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigratedKey {
    pub hash: String,
    pub key_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedMigratedKey {
    pub hash: String,
    pub error: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKeyResponse {
    pub key: String,
    #[serde(alias = "id")]
    pub key_id: String,
    #[serde(default)]
    pub api_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Key {
    #[serde(default, alias = "keyId")]
    pub id: String,
    #[serde(default)]
    pub api_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub meta: Metadata,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub expires: Option<i64>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyKeyResponse {
    pub valid: bool,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default, alias = "id")]
    pub key_id: Option<String>,
    #[serde(default)]
    pub owner_id: Option<String>,
    #[serde(default)]
    pub identity_id: Option<String>,
    #[serde(default)]
    pub meta: Metadata,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub remaining: Option<i64>,
    #[serde(default)]
    pub ratelimit: Option<RatelimitState>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RerollKeyResponse {
    pub key: String,
    #[serde(alias = "id")]
    pub key_id: String,
}

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIdentityRequest {
    pub external_id: String,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub meta: Metadata,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratelimits: Vec<RatelimitConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityRequest {
    pub identity: String,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateIdentityRequest {
    pub identity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub meta: Metadata,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratelimits: Vec<RatelimitConfig>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIdentitiesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    #[serde(default, alias = "id")]
    pub identity_id: String,
    pub external_id: String,
    #[serde(default)]
    pub meta: Metadata,
    #[serde(default)]
    pub ratelimits: Vec<RatelimitConfig>,
}

// ---------------------------------------------------------------------------
// Permissions and roles
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePermissionRequest {
    pub name: String,
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub permission: String,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPermissionsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permission {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoleRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleRequest {
    pub role: String,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRolesRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
}

// ---------------------------------------------------------------------------
// Ratelimit
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitRequest {
    pub namespace: String,
    pub identifier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<u64>,
    #[serde(rename = "async", skip_serializing_if = "Option::is_none")]
    pub asynchronous: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiLimitRequest {
    pub namespace: String,
    pub identifiers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatelimitOverrideRequest {
    pub namespace: String,
    pub identifier: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetRatelimitOverrideRequest {
    pub namespace: String,
    pub identifier: String,
    pub limit: u64,
    pub duration: u64,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRatelimitOverridesRequest {
    pub namespace: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitResponse {
    pub success: bool,
    pub limit: u64,
    pub remaining: i64,
    pub reset: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatelimitOverride {
    pub namespace: String,
    pub identifier: String,
    pub limit: u64,
    pub duration: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn create_key_serializes_like_typescript_sdk() {
        let mut meta = Metadata::new();
        meta.insert("plan".to_owned(), json!("enterprise"));

        let request = CreateKeyRequest {
            api_id: "api_123".to_owned(),
            prefix: Some("prod".to_owned()),
            name: Some("Production key".to_owned()),
            permissions: vec!["documents.read".to_owned()],
            meta,
            ratelimits: vec![RatelimitConfig {
                name: "requests".to_owned(),
                limit: 100,
                duration: 60_000,
                cost: None,
                auto_apply: Some(true),
            }],
            ..Default::default()
        };

        let value = serde_json::to_value(request).expect("serializes");
        assert_eq!(value["apiId"], "api_123");
        assert_eq!(value["byteLength"], Value::Null);
        assert_eq!(value["ratelimits"][0]["autoApply"], true);
        assert_eq!(value["meta"]["plan"], "enterprise");
    }

    #[test]
    fn verify_key_permissions_accept_string_or_list() {
        let one = VerifyKeyRequest {
            key: "sk_123".to_owned(),
            permissions: Some(PermissionCheck::from("documents.write")),
            ..Default::default()
        };
        let one = serde_json::to_value(one).expect("serializes");
        assert_eq!(one["permissions"], "documents.write");

        let many = VerifyKeyRequest {
            key: "sk_123".to_owned(),
            permissions: Some(PermissionCheck::from(vec![
                "documents.read".to_owned(),
                "documents.write".to_owned(),
            ])),
            ..Default::default()
        };
        let many = serde_json::to_value(many).expect("serializes");
        assert_eq!(many["permissions"][0], "documents.read");
    }
}
