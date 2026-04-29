use crate::client::Polar;
use crate::error::Result;
use crate::models::Product;

/// `/v1/products/` resource.
#[derive(Debug, Clone)]
pub struct Products {
    client: Polar,
}

impl Products {
    pub(crate) fn new(client: Polar) -> Self {
        Self { client }
    }

    /// Fetches a single product by id.
    pub async fn get(&self, id: &str) -> Result<Product> {
        self.client.get(&format!("/v1/products/{id}")).await
    }
}
