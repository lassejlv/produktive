use serde::{Deserialize, Serialize};

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct PlatformClient {
    autumn: Autumn,
}

impl PlatformClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn create_organization(
        &self,
        params: CreateOrganizationParams,
    ) -> Result<CreateOrganizationResponse> {
        self.autumn.post("/v1/platform/organizations", params).await
    }

    pub async fn list_organizations(
        &self,
        params: PlatformListParams,
    ) -> Result<PlatformOrganizationsResponse> {
        self.autumn.get("/v1/platform/organizations", params).await
    }

    pub async fn list_users(
        &self,
        params: PlatformListUsersParams,
    ) -> Result<PlatformUsersResponse> {
        self.autumn.get("/v1/platform/users", params).await
    }

    pub async fn generate_stripe_oauth_url(
        &self,
        params: GenerateOAuthUrlParams,
    ) -> Result<GenerateOAuthUrlResponse> {
        self.autumn.post("/v1/platform/oauth_url", params).await
    }

    pub async fn update_connected_stripe_account(
        &self,
        params: UpdateConnectedStripeAccountParams,
    ) -> Result<UpdateConnectedStripeAccountResponse> {
        self.autumn
            .post("/v1/platform/organizations/stripe", params)
            .await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrganizationParams {
    pub user_email: String,
    pub name: String,
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<PlatformEnv>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformEnv {
    Test,
    Live,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrganizationResponse {
    pub test_secret_key: Option<String>,
    pub live_secret_key: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct PlatformListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct PlatformListUsersParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformOrganizationsResponse {
    pub list: Vec<PlatformOrganization>,
    pub total: Option<f64>,
    pub limit: Option<f64>,
    pub offset: Option<f64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformUsersResponse {
    pub list: Vec<PlatformUser>,
    pub total: Option<f64>,
    pub limit: Option<f64>,
    pub offset: Option<f64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformOrganization {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub created_at: Option<i64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformUser {
    pub email: Option<String>,
    pub created_at: Option<i64>,
    pub organizations: Option<Vec<PlatformOrganization>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateOAuthUrlParams {
    pub organization_slug: String,
    pub env: PlatformEnv,
    pub redirect_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateOAuthUrlResponse {
    pub oauth_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConnectedStripeAccountParams {
    pub organization_slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub live_account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConnectedStripeAccountResponse {
    pub message: Option<String>,
    pub organization: Option<PlatformOrganization>,
    #[serde(flatten)]
    pub extra: JsonMap,
}
