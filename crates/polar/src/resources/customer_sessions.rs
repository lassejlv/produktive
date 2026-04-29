use crate::client::Polar;
use crate::error::Result;
use crate::models::{CreateCustomerSessionRequest, CustomerSession};

/// `/v1/customer-sessions/` resource.
#[derive(Debug, Clone)]
pub struct CustomerSessions {
    client: Polar,
}

impl CustomerSessions {
    pub(crate) fn new(client: Polar) -> Self {
        Self { client }
    }

    /// Creates a customer portal session and returns the pre-authenticated
    /// portal URL. Send the customer to `customer_portal_url`.
    pub async fn create(
        &self,
        request: CreateCustomerSessionRequest,
    ) -> Result<CustomerSession> {
        self.client.post("/v1/customer-sessions/", &request).await
    }
}
