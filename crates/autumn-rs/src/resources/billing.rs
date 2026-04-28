use crate::models::{
    AttachRequest, AttachResponse, BillingUpdateRequest, MultiAttachRequest,
    OpenCustomerPortalRequest, OpenCustomerPortalResponse, PreviewAttachRequest,
    PreviewAttachResponse, SetupPaymentRequest, SetupPaymentResponse,
};
use crate::{Autumn, Result};

/// Direct billing endpoints. Construct via [`Autumn::billing`](crate::Autumn::billing).
///
/// Use [`Autumn::attach`](crate::Autumn::attach) and
/// [`Autumn::cancel`](crate::Autumn::cancel) for the common attach/cancel
/// flows; reach for `billing()` when you need the multi-attach, preview,
/// setup-payment, or customer portal endpoints.
#[derive(Clone, Debug)]
pub struct Billing {
    client: Autumn,
}

impl Billing {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/billing.attach` — subscribe a customer to a plan.
    ///
    /// Identical wire endpoint to [`Autumn::attach`](crate::Autumn::attach);
    /// use this form when you've built the request struct directly.
    pub async fn attach(&self, request: AttachRequest) -> Result<AttachResponse> {
        self.client.post("/billing.attach", &request).await
    }

    /// `POST /v1/billing.multi_attach` — attach multiple plans in a single
    /// Stripe subscription.
    pub async fn multi_attach(&self, request: MultiAttachRequest) -> Result<AttachResponse> {
        self.client.post("/billing.multi_attach", &request).await
    }

    /// `POST /v1/billing.preview_attach` — dry-run an attach to see line
    /// items, totals, and proration without making any changes.
    pub async fn preview_attach(
        &self,
        request: PreviewAttachRequest,
    ) -> Result<PreviewAttachResponse> {
        self.client.post("/billing.preview_attach", &request).await
    }

    /// `POST /v1/billing.update` — modify an existing subscription
    /// (quantities, plan version, cancellation state, etc.).
    pub async fn update(&self, request: BillingUpdateRequest) -> Result<AttachResponse> {
        self.client.post("/billing.update", &request).await
    }

    /// `POST /v1/billing.setup_payment` — create a Stripe Checkout session
    /// for adding or updating a payment method (no plan attached).
    pub async fn setup_payment(
        &self,
        request: SetupPaymentRequest,
    ) -> Result<SetupPaymentResponse> {
        self.client.post("/billing.setup_payment", &request).await
    }

    /// `POST /v1/billing.open_customer_portal` — generate a Stripe billing
    /// portal session URL for the customer to manage their subscription.
    pub async fn open_customer_portal(
        &self,
        request: OpenCustomerPortalRequest,
    ) -> Result<OpenCustomerPortalResponse> {
        self.client
            .post("/billing.open_customer_portal", &request)
            .await
    }
}
