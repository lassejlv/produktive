use crate::models::{
    CreateBalanceRequest, DeleteBalanceRequest, FinalizeLockRequest, SuccessResponse,
    UpdateBalanceRequest,
};
use crate::{Autumn, Result};

/// Balances resource. Construct via [`Autumn::balances`](crate::Autumn::balances).
///
/// Use this when you need to mutate balances directly (e.g. a one-off grant,
/// an admin adjustment, or finalizing a [`Lock`](crate::models::Lock)). For
/// regular feature gating prefer [`Autumn::check`](crate::Autumn::check) /
/// [`Autumn::track`](crate::Autumn::track).
#[derive(Clone, Debug)]
pub struct Balances {
    client: Autumn,
}

impl Balances {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/balances.create` — grant a new balance for a feature.
    pub async fn create(&self, request: CreateBalanceRequest) -> Result<SuccessResponse> {
        self.client.post("/balances.create", &request).await
    }

    /// `POST /v1/balances.update` — set or adjust an existing balance. Use
    /// `remaining` for absolute, `add_to_balance` for relative, or `usage` to
    /// override consumed amount.
    pub async fn update(&self, request: UpdateBalanceRequest) -> Result<SuccessResponse> {
        self.client.post("/balances.update", &request).await
    }

    /// `POST /v1/balances.delete` — remove a balance. Cannot delete balances
    /// tied to a price.
    pub async fn delete(&self, request: DeleteBalanceRequest) -> Result<SuccessResponse> {
        self.client.post("/balances.delete", &request).await
    }

    /// `POST /v1/balances.finalize` — commit (`confirm`) or release a
    /// previously locked balance.
    pub async fn finalize(&self, request: FinalizeLockRequest) -> Result<SuccessResponse> {
        self.client.post("/balances.finalize", &request).await
    }
}
