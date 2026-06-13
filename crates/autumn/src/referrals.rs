use serde::{Deserialize, Serialize};

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct ReferralsClient {
    autumn: Autumn,
}

impl ReferralsClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn create_code(&self, params: CreateReferralCodeParams) -> Result<ReferralCode> {
        self.autumn.post("/v1/referrals.create_code", params).await
    }

    pub async fn redeem_code(
        &self,
        params: RedeemReferralCodeParams,
    ) -> Result<ReferralRedemption> {
        self.autumn.post("/v1/referrals.redeem_code", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReferralCodeParams {
    pub customer_id: String,
    pub program_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferralCode {
    pub code: String,
    pub customer_id: String,
    pub created_at: i64,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemReferralCodeParams {
    pub customer_id: String,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferralRedemption {
    pub success: Option<bool>,
    pub customer_id: Option<String>,
    pub code: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}
