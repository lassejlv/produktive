use crate::models::{
    CreateReferralCodeRequest, CreateReferralCodeResponse, RedeemReferralCodeRequest,
    RedeemReferralCodeResponse,
};
use crate::{Autumn, Result};

/// Referrals resource. Construct via [`Autumn::referrals`](crate::Autumn::referrals).
///
/// Implements Autumn's "rewards and referrals" feature. Generate a code for a
/// referrer with [`create_code`](Self::create_code), then redeem it on a
/// new customer with [`redeem_code`](Self::redeem_code) to apply the reward.
#[derive(Clone, Debug)]
pub struct Referrals {
    client: Autumn,
}

impl Referrals {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/referrals.create_code` — issue (or fetch the existing) code
    /// for a customer in a referral program.
    pub async fn create_code(
        &self,
        request: CreateReferralCodeRequest,
    ) -> Result<CreateReferralCodeResponse> {
        self.client.post("/referrals.create_code", &request).await
    }

    /// `POST /v1/referrals.redeem_code` — apply a referral code to another
    /// customer; returns the resulting reward id.
    pub async fn redeem_code(
        &self,
        request: RedeemReferralCodeRequest,
    ) -> Result<RedeemReferralCodeResponse> {
        self.client.post("/referrals.redeem_code", &request).await
    }
}
