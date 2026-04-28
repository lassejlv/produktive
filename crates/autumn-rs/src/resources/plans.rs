use crate::models::{
    CreatePlanRequest, DeletePlanRequest, GetPlanRequest, ListPlansParams, ListPlansResponse, Plan,
    SuccessResponse, UpdatePlanRequest,
};
use crate::{Autumn, Result};

/// Plan resource. Construct via [`Autumn::plans`](crate::Autumn::plans).
///
/// Plans are v2's name for what v1 called "products". A plan groups feature
/// allowances and pricing; updates create a new version unless explicitly
/// disabled.
#[derive(Clone, Debug)]
pub struct Plans {
    client: Autumn,
}

impl Plans {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/plans.create` — create a new plan.
    pub async fn create(&self, request: CreatePlanRequest) -> Result<Plan> {
        self.client.post("/plans.create", &request).await
    }

    /// `POST /v1/plans.get` — fetch a plan, optionally pinned to a version.
    pub async fn get(&self, request: GetPlanRequest) -> Result<Plan> {
        self.client.post("/plans.get", &request).await
    }

    /// `POST /v1/plans.list` — list plans with optional customer-eligibility
    /// hints.
    pub async fn list(&self, params: ListPlansParams) -> Result<ListPlansResponse> {
        self.client.post("/plans.list", &params).await
    }

    /// `POST /v1/plans.update` — modify a plan. By default this creates a new
    /// version of the plan rather than mutating the existing one.
    pub async fn update(&self, request: UpdatePlanRequest) -> Result<Plan> {
        self.client.post("/plans.update", &request).await
    }

    /// `POST /v1/plans.delete` — delete a plan. Plans with active customers
    /// cannot be deleted; archive them with `update` instead.
    pub async fn delete(&self, request: DeletePlanRequest) -> Result<SuccessResponse> {
        self.client.post("/plans.delete", &request).await
    }
}
