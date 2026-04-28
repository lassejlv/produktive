//! Referral code request/response types.

use serde::{Deserialize, Serialize};

use super::shared::Extra;

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct CreateReferralCodeRequest {
    pub customer_id: String,
    pub program_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CreateReferralCodeResponse {
    pub code: String,
    pub customer_id: String,
    pub created_at: i64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct RedeemReferralCodeRequest {
    pub code: String,
    pub customer_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct RedeemReferralCodeResponse {
    pub id: String,
    pub customer_id: String,
    pub reward_id: String,
    #[serde(default, flatten)]
    pub extra: Extra,
}
