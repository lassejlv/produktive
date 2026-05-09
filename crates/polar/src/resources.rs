use serde::Serialize;

use crate::client::Polar;
use crate::error::Result;
use crate::JsonValue;

impl Polar {
    pub fn benefits(&self) -> Benefits<'_> {
        Benefits::new(self)
    }

    pub fn checkouts(&self) -> Checkouts<'_> {
        Checkouts::new(self)
    }

    pub fn customers(&self) -> Customers<'_> {
        Customers::new(self)
    }

    pub fn customer_sessions(&self) -> CustomerSessions<'_> {
        CustomerSessions::new(self)
    }

    pub fn orders(&self) -> Orders<'_> {
        Orders::new(self)
    }

    pub fn organizations(&self) -> Organizations<'_> {
        Organizations::new(self)
    }

    pub fn products(&self) -> Products<'_> {
        Products::new(self)
    }

    pub fn subscriptions(&self) -> Subscriptions<'_> {
        Subscriptions::new(self)
    }

    pub fn webhooks(&self) -> Webhooks<'_> {
        Webhooks::new(self)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Organizations<'a> {
    client: &'a Polar,
}

impl<'a> Organizations<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client
            .get_json("/v1/organizations/", Some(query))
            .await
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/organizations/", body).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/organizations/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/organizations/{id}"), body)
            .await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Products<'a> {
    client: &'a Polar,
}

impl<'a> Products<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client.get_json("/v1/products/", Some(query)).await
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/products/", body).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/products/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/products/{id}"), body)
            .await
    }

    pub async fn update_benefits<B: Serialize + ?Sized>(
        &self,
        id: &str,
        body: &B,
    ) -> Result<JsonValue> {
        self.client
            .post_json(&format!("/v1/products/{id}/benefits"), body)
            .await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Benefits<'a> {
    client: &'a Polar,
}

impl<'a> Benefits<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client.get_json("/v1/benefits/", Some(query)).await
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/benefits/", body).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/benefits/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/benefits/{id}"), body)
            .await
    }

    pub async fn delete(&self, id: &str) -> Result<JsonValue> {
        self.client.delete_json(&format!("/v1/benefits/{id}")).await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Checkouts<'a> {
    client: &'a Polar,
}

impl<'a> Checkouts<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client.get_json("/v1/checkouts/", Some(query)).await
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/checkouts/", body).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/checkouts/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/checkouts/{id}"), body)
            .await
    }

    pub async fn client_get(&self, client_secret: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/checkouts/client/{client_secret}"), None)
            .await
    }

    pub async fn client_update<B: Serialize + ?Sized>(
        &self,
        client_secret: &str,
        body: &B,
    ) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/checkouts/client/{client_secret}"), body)
            .await
    }

    pub async fn client_confirm<B: Serialize + ?Sized>(
        &self,
        client_secret: &str,
        body: &B,
    ) -> Result<JsonValue> {
        self.client
            .post_json(
                &format!("/v1/checkouts/client/{client_secret}/confirm"),
                body,
            )
            .await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Customers<'a> {
    client: &'a Polar,
}

impl<'a> Customers<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client.get_json("/v1/customers/", Some(query)).await
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/customers/", body).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/customers/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/customers/{id}"), body)
            .await
    }

    pub async fn delete(&self, id: &str) -> Result<JsonValue> {
        self.client
            .delete_json(&format!("/v1/customers/{id}"))
            .await
    }

    pub async fn get_external(&self, external_id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/customers/external/{external_id}"), None)
            .await
    }

    pub async fn get_state(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/customers/{id}/state"), None)
            .await
    }

    pub async fn get_state_external(&self, external_id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/customers/external/{external_id}/state"), None)
            .await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CustomerSessions<'a> {
    client: &'a Polar,
}

impl<'a> CustomerSessions<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/customer-sessions/", body).await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Subscriptions<'a> {
    client: &'a Polar,
}

impl<'a> Subscriptions<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client
            .get_json("/v1/subscriptions/", Some(query))
            .await
    }

    pub async fn create<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/subscriptions/", body).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/subscriptions/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/subscriptions/{id}"), body)
            .await
    }

    pub async fn revoke(&self, id: &str) -> Result<JsonValue> {
        self.client
            .delete_json(&format!("/v1/subscriptions/{id}"))
            .await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Orders<'a> {
    client: &'a Polar,
}

impl<'a> Orders<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client.get_json("/v1/orders/", Some(query)).await
    }

    pub async fn get(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/orders/{id}"), None)
            .await
    }

    pub async fn update<B: Serialize + ?Sized>(&self, id: &str, body: &B) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/orders/{id}"), body)
            .await
    }

    pub async fn generate_invoice<B: Serialize + ?Sized>(
        &self,
        id: &str,
        body: &B,
    ) -> Result<JsonValue> {
        self.client
            .post_json(&format!("/v1/orders/{id}/invoice"), body)
            .await
    }

    pub async fn invoice(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/orders/{id}/invoice"), None)
            .await
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Webhooks<'a> {
    client: &'a Polar,
}

impl<'a> Webhooks<'a> {
    pub(crate) fn new(client: &'a Polar) -> Self {
        Self { client }
    }

    pub async fn list_endpoints<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client
            .get_json("/v1/webhooks/endpoints", Some(query))
            .await
    }

    pub async fn create_endpoint<B: Serialize + ?Sized>(&self, body: &B) -> Result<JsonValue> {
        self.client.post_json("/v1/webhooks/endpoints", body).await
    }

    pub async fn get_endpoint(&self, id: &str) -> Result<JsonValue> {
        self.client
            .get_json::<JsonValue, ()>(&format!("/v1/webhooks/endpoints/{id}"), None)
            .await
    }

    pub async fn update_endpoint<B: Serialize + ?Sized>(
        &self,
        id: &str,
        body: &B,
    ) -> Result<JsonValue> {
        self.client
            .patch_json(&format!("/v1/webhooks/endpoints/{id}"), body)
            .await
    }

    pub async fn delete_endpoint(&self, id: &str) -> Result<JsonValue> {
        self.client
            .delete_json(&format!("/v1/webhooks/endpoints/{id}"))
            .await
    }

    pub async fn list_deliveries<Q: Serialize + ?Sized>(&self, query: &Q) -> Result<JsonValue> {
        self.client
            .get_json("/v1/webhooks/deliveries", Some(query))
            .await
    }

    pub async fn redeliver_event(&self, id: &str) -> Result<JsonValue> {
        self.client
            .post_json(&format!("/v1/webhooks/events/{id}/redeliver"), &())
            .await
    }
}
