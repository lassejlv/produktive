use crate::models::{
    Customer, DeleteCustomerRequest, GetOrCreateCustomerRequest, ListCustomersParams,
    ListCustomersResponse, SuccessResponse, UpdateCustomerRequest,
};
use crate::{Autumn, Result};

/// Customer resource. Construct via [`Autumn::customers`](crate::Autumn::customers).
///
/// In v2 there is no separate `create` endpoint — use
/// [`get_or_create`](Self::get_or_create), which is idempotent on
/// `customer_id` and will return the existing customer if one is already
/// registered.
#[derive(Clone, Debug)]
pub struct Customers {
    client: Autumn,
}

impl Customers {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/customers.list` — paginated, optionally filtered listing.
    pub async fn list(&self, params: ListCustomersParams) -> Result<ListCustomersResponse> {
        self.client.post("/customers.list", &params).await
    }

    /// `POST /v1/customers.get_or_create` — fetch by external id, or create
    /// the customer if none exists.
    pub async fn get_or_create(&self, request: GetOrCreateCustomerRequest) -> Result<Customer> {
        self.client
            .post("/customers.get_or_create", &request)
            .await
    }

    /// `POST /v1/customers.update` — patch a customer in place. Use
    /// `new_customer_id` on the request to rename.
    pub async fn update(&self, request: UpdateCustomerRequest) -> Result<Customer> {
        self.client.post("/customers.update", &request).await
    }

    /// `POST /v1/customers.delete` — pass `delete_in_stripe: true` to also
    /// remove the underlying Stripe customer.
    pub async fn delete(&self, request: DeleteCustomerRequest) -> Result<SuccessResponse> {
        self.client.post("/customers.delete", &request).await
    }
}
