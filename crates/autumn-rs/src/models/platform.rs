//! Multi-tenant Platform API (Beta) types.
//!
//! Note: this sub-API uses a different `env` enum
//! ([`PlatformEnv`] = `test|live|both`, [`OAuthEnv`] = `test|live`) than the
//! core API's [`Environment`](super::shared::Environment) (`sandbox|live`).
//! Don't confuse them.

use serde::{Deserialize, Serialize};

use super::shared::Extra;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum PlatformEnv {
    Test,
    Live,
    #[default]
    Both,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum OAuthEnv {
    Test,
    Live,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct CreateOrganizationRequest {
    pub user_email: String,
    pub name: String,
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<PlatformEnv>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CreateOrganizationResponse {
    #[serde(default)]
    pub test_secret_key: Option<String>,
    #[serde(default)]
    pub live_secret_key: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct ListPlatformOrgsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListPlatformOrgsResponse {
    #[serde(default)]
    pub list: Vec<PlatformOrganization>,
    #[serde(default)]
    pub total: Option<f64>,
    #[serde(default)]
    pub limit: Option<f64>,
    #[serde(default)]
    pub offset: Option<f64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlatformOrganization {
    pub slug: String,
    pub name: String,
    pub created_at: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct ListPlatformUsersParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListPlatformUsersResponse {
    #[serde(default)]
    pub list: Vec<PlatformUser>,
    #[serde(default)]
    pub total: Option<f64>,
    #[serde(default)]
    pub limit: Option<f64>,
    #[serde(default)]
    pub offset: Option<f64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlatformUser {
    pub email: String,
    pub created_at: f64,
    #[serde(default)]
    pub organizations: Option<Vec<PlatformOrganization>>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct GenerateOAuthUrlRequest {
    pub organization_slug: String,
    pub env: OAuthEnv,
    pub redirect_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct GenerateOAuthUrlResponse {
    pub oauth_url: String,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct UpdateStripeConfigRequest {
    pub organization_slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub live_account_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct UpdateStripeConfigResponse {
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub organization: Option<UpdateStripeOrganization>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct UpdateStripeOrganization {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}
