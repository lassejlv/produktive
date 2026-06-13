use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct CustomersClient {
    autumn: Autumn,
}

impl CustomersClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn get_or_create(&self, params: CustomerParams) -> Result<Customer> {
        self.autumn
            .post("/v1/customers.get_or_create", params)
            .await
    }

    pub async fn get(&self, params: GetCustomerParams) -> Result<Customer> {
        self.autumn.post("/v1/customers.get", params).await
    }

    pub async fn update(&self, params: CustomerParams) -> Result<Customer> {
        self.autumn.post("/v1/customers.update", params).await
    }

    pub async fn list(&self, params: ListCustomersParams) -> Result<PagedResponse<Customer>> {
        self.autumn.post("/v1/customers.list", params).await
    }

    pub async fn delete(&self, params: DeleteCustomerParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/customers.delete", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerParams {
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<JsonMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stripe_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_in_stripe: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_enable_plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_email_receipts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<Vec<String>>,
}

impl CustomerParams {
    pub fn new(customer_id: impl Into<String>) -> Self {
        Self {
            customer_id: Some(customer_id.into()),
            name: None,
            email: None,
            fingerprint: None,
            metadata: None,
            stripe_id: None,
            create_in_stripe: None,
            auto_enable_plan_id: None,
            send_email_receipts: None,
            billing_controls: None,
            config: None,
            expand: None,
        }
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn email(mut self, email: impl Into<String>) -> Self {
        self.email = Some(email.into());
        self
    }

    pub fn expand(mut self, expand: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.expand = Some(expand.into_iter().map(Into::into).collect());
        self
    }

    pub fn auto_enable_plan_id(mut self, plan_id: impl Into<String>) -> Self {
        self.auto_enable_plan_id = Some(plan_id.into());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetCustomerParams {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<Vec<String>>,
}

impl GetCustomerParams {
    pub fn new(customer_id: impl Into<String>) -> Self {
        Self {
            customer_id: customer_id.into(),
            expand: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListCustomersParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteCustomerParams {
    pub customer_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn customer_params_serialize_free_plan_auto_enable() {
        let body = serde_json::to_value(
            CustomerParams::new("cus_123")
                .email("owner@example.com")
                .auto_enable_plan_id("free")
                .expand(["subscriptions.plan", "balances.feature"]),
        )
        .unwrap();

        assert_eq!(body["customer_id"], "cus_123");
        assert_eq!(body["email"], "owner@example.com");
        assert_eq!(body["auto_enable_plan_id"], "free");
        assert_eq!(body["expand"][0], "subscriptions.plan");
    }
}
