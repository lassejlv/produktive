use serde::{Deserialize, Serialize};

use crate::{Polar, Result};

#[derive(Clone, Debug)]
pub struct CustomerSessionsClient {
    polar: Polar,
}

impl CustomerSessionsClient {
    pub(crate) fn new(polar: Polar) -> Self {
        Self { polar }
    }

    /// `POST /v1/customer-sessions/` — mint a customer portal session for the
    /// customer identified by `external_customer_id`.
    pub async fn create(
        &self,
        external_customer_id: &str,
        return_url: Option<&str>,
    ) -> Result<CustomerSession> {
        #[derive(Serialize)]
        struct Body<'a> {
            external_customer_id: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            return_url: Option<&'a str>,
        }
        self.polar
            .post(
                "/v1/customer-sessions/",
                Body {
                    external_customer_id,
                    return_url,
                },
            )
            .await
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CustomerSession {
    pub token: String,
    pub customer_portal_url: String,
    #[serde(default)]
    pub customer_id: Option<String>,
}
