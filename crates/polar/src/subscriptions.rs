use serde::{Deserialize, Serialize};

use crate::{Polar, Result};

#[derive(Clone, Debug)]
pub struct SubscriptionsClient {
    polar: Polar,
}

impl SubscriptionsClient {
    pub(crate) fn new(polar: Polar) -> Self {
        Self { polar }
    }

    /// `POST /v1/subscriptions/` — subscribe an external customer to a product
    /// directly (used for the free tier; auto-creates the customer if needed).
    pub async fn create(
        &self,
        product_id: &str,
        external_customer_id: &str,
    ) -> Result<Subscription> {
        #[derive(Serialize)]
        struct Body<'a> {
            product_id: &'a str,
            external_customer_id: &'a str,
        }
        self.polar
            .post(
                "/v1/subscriptions/",
                Body {
                    product_id,
                    external_customer_id,
                },
            )
            .await
    }

    /// `PATCH /v1/subscriptions/{id}` — schedule cancellation at period end
    /// (`true`) or undo a scheduled cancellation (`false`).
    pub async fn set_cancel_at_period_end(&self, id: &str, cancel: bool) -> Result<Subscription> {
        #[derive(Serialize)]
        struct Body {
            cancel_at_period_end: bool,
        }
        self.polar
            .patch(
                &format!("/v1/subscriptions/{id}"),
                Body {
                    cancel_at_period_end: cancel,
                },
            )
            .await
    }

    /// `PATCH /v1/subscriptions/{id}` — switch the subscription to another
    /// product (upgrade/downgrade with proration).
    pub async fn change_product(&self, id: &str, product_id: &str) -> Result<Subscription> {
        self.change_product_with_proration(id, product_id, ProrationBehavior::Prorate)
            .await
    }

    pub async fn change_product_with_proration(
        &self,
        id: &str,
        product_id: &str,
        proration_behavior: ProrationBehavior,
    ) -> Result<Subscription> {
        #[derive(Serialize)]
        struct Body<'a> {
            product_id: &'a str,
            proration_behavior: ProrationBehavior,
        }
        self.polar
            .patch(
                &format!("/v1/subscriptions/{id}"),
                Body {
                    product_id,
                    proration_behavior,
                },
            )
            .await
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProrationBehavior {
    Invoice,
    Prorate,
    NextPeriod,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub cancel_at_period_end: bool,
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use crate::Polar;

    #[tokio::test]
    async fn change_product_sends_proration_behavior() {
        let (base_url, handle) = spawn_server(
            200,
            r#"{"id":"sub_1","status":"active","product_id":"prod_basic","cancel_at_period_end":false}"#,
        );
        let polar = Polar::builder()
            .secret_key("polar_sk_test")
            .base_url(base_url)
            .build()
            .unwrap();

        let sub = polar
            .subscriptions()
            .change_product("sub_1", "prod_basic")
            .await
            .unwrap();
        let request = handle.join().unwrap();

        assert_eq!(sub.id, "sub_1");
        assert!(request.starts_with("PATCH /v1/subscriptions/sub_1 HTTP/1.1"));
        assert!(request.contains(r#""product_id":"prod_basic""#));
        assert!(request.contains(r#""proration_behavior":"prorate""#));
    }

    fn spawn_server(status: u16, body: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 8192];
            let read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            let response = format!(
                "HTTP/1.1 {status} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });
        (format!("http://{addr}"), handle)
    }
}
