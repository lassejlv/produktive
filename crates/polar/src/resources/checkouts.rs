use crate::client::Polar;
use crate::error::Result;
use crate::models::{Checkout, CreateCheckoutRequest};

/// `/v1/checkouts/` resource.
#[derive(Debug, Clone)]
pub struct Checkouts {
    client: Polar,
}

impl Checkouts {
    pub(crate) fn new(client: Polar) -> Self {
        Self { client }
    }

    /// Creates a checkout session and returns the URL to redirect the customer
    /// to. `request.products` must not be empty.
    pub async fn create(&self, request: CreateCheckoutRequest) -> Result<Checkout> {
        self.client.post("/v1/checkouts/", &request).await
    }
}
