use crate::models::{
    CreateEntityRequest, DeleteEntityRequest, Entity, GetEntityRequest, SuccessResponse,
    UpdateEntityRequest,
};
use crate::{Autumn, Result};

/// Entity resource. Construct via [`Autumn::entities`](crate::Autumn::entities).
///
/// Entities are sub-customers used to track per-seat or per-workspace usage.
/// Each entity belongs to a customer and is anchored to a feature (typically
/// the seat/workspace counter) via `feature_id`.
#[derive(Clone, Debug)]
pub struct Entities {
    client: Autumn,
}

impl Entities {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/entities.create` — create an entity under a customer.
    pub async fn create(&self, request: CreateEntityRequest) -> Result<Entity> {
        self.client.post("/entities.create", &request).await
    }

    /// `POST /v1/entities.get` — fetch an entity with its balances and
    /// subscriptions.
    pub async fn get(&self, request: GetEntityRequest) -> Result<Entity> {
        self.client.post("/entities.get", &request).await
    }

    /// `POST /v1/entities.update` — adjust the entity's billing controls.
    pub async fn update(&self, request: UpdateEntityRequest) -> Result<Entity> {
        self.client.post("/entities.update", &request).await
    }

    /// `POST /v1/entities.delete` — remove an entity.
    pub async fn delete(&self, request: DeleteEntityRequest) -> Result<SuccessResponse> {
        self.client.post("/entities.delete", &request).await
    }
}
