use crate::models::{
    CreateOrganizationRequest, CreateOrganizationResponse, GenerateOAuthUrlRequest,
    GenerateOAuthUrlResponse, ListPlatformOrgsParams, ListPlatformOrgsResponse,
    ListPlatformUsersParams, ListPlatformUsersResponse, UpdateStripeConfigRequest,
    UpdateStripeConfigResponse,
};
use crate::request::query_string;
use crate::{Autumn, Result};

/// Multi-tenant Platform API (Beta). Construct via
/// [`Autumn::platform`](crate::Autumn::platform).
///
/// Lets you provision tenant organizations and connect Stripe Connect accounts
/// on behalf of your customers. Requires platform feature access on your
/// Autumn account — contact `hey@useautumn.com` for early access.
///
/// Unlike the rest of v2, the platform sub-API is REST-style: list endpoints
/// are `GET` with query parameters, and `create_organization` returns 201.
#[derive(Clone, Debug)]
pub struct Platform {
    client: Autumn,
}

impl Platform {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/platform/organizations` — create a tenant organization. Reuses
    /// existing users / orgs if they already exist.
    pub async fn create_organization(
        &self,
        request: CreateOrganizationRequest,
    ) -> Result<CreateOrganizationResponse> {
        self.client.post("/platform/organizations", &request).await
    }

    /// `GET /v1/platform/organizations` — paginated list of orgs created via
    /// the Platform API.
    pub async fn list_organizations(
        &self,
        params: ListPlatformOrgsParams,
    ) -> Result<ListPlatformOrgsResponse> {
        let query = query_string(&params)?;
        let path = if query.is_empty() {
            "/platform/organizations".to_owned()
        } else {
            format!("/platform/organizations?{query}")
        };
        self.client.get(&path).await
    }

    /// `GET /v1/platform/users` — paginated list of users. Pass
    /// `expand: Some("organizations".into())` to include each user's orgs.
    pub async fn list_users(
        &self,
        params: ListPlatformUsersParams,
    ) -> Result<ListPlatformUsersResponse> {
        let query = query_string(&params)?;
        let path = if query.is_empty() {
            "/platform/users".to_owned()
        } else {
            format!("/platform/users?{query}")
        };
        self.client.get(&path).await
    }

    /// `POST /v1/platform/oauth_url` — generate a Stripe Connect OAuth URL
    /// for a tenant organization to connect their own Stripe account.
    pub async fn generate_oauth_url(
        &self,
        request: GenerateOAuthUrlRequest,
    ) -> Result<GenerateOAuthUrlResponse> {
        self.client.post("/platform/oauth_url", &request).await
    }

    /// `POST /v1/platform/organizations/stripe` — associate a Stripe Connect
    /// account ID with a tenant org using your master Stripe credentials
    /// (instead of the OAuth flow).
    pub async fn update_stripe(
        &self,
        request: UpdateStripeConfigRequest,
    ) -> Result<UpdateStripeConfigResponse> {
        self.client
            .post("/platform/organizations/stripe", &request)
            .await
    }
}
