//! Wire types for every Autumn v2 endpoint.
//!
//! Modules are split per namespace ([`balance`], [`billing`], [`customer`],
//! [`entity`], [`events`], [`feature`], [`plan`], [`platform`], [`referrals`])
//! plus a [`shared`] module for cross-cutting types (intervals, billing
//! controls, locks). The [`core`] module hosts the request/response types for
//! `check` and `track`.
//!
//! All wire fields use `snake_case`. Optional response fields that may come
//! back as JSON `null` are modelled as `Option<T>`.

pub mod balance;
pub mod billing;
pub mod core;
pub mod customer;
pub mod entity;
pub mod events;
pub mod feature;
pub mod plan;
pub mod platform;
pub mod referrals;
pub mod shared;

pub use balance::{
    Balance, BalanceBreakdown, BalanceBreakdownPrice, BalanceRollover, BalanceRolloverEntry,
    BreakdownInterval, BreakdownReset, CreateBalanceRequest, DeleteBalanceRequest, FinalizeAction,
    FinalizeLockRequest, Flag, UpdateBalanceRequest,
};
pub use billing::{
    AttachCustomize, AttachDiscount, AttachRequest, AttachResponse, BillingUpdateRequest,
    CancelAction, CarryOverConfig, CheckoutType, CustomLineItem, FeatureQuantity,
    IncomingFeatureQuantity, IncomingOutgoing, Invoice, InvoiceMode, LineItem, LineItemDiscount,
    MultiAttachCustomize, MultiAttachEntityData, MultiAttachPlan, MultiAttachRequest, NextCycle,
    OpenCustomerPortalRequest, OpenCustomerPortalResponse, Period, PlanSchedule,
    PreviewAttachRequest, PreviewAttachResponse, ProrationBehavior, RecalculateBalances,
    RedirectMode, RequiredAction, RequiredActionCode, SetupPaymentRequest, SetupPaymentResponse,
    UsageLineItem,
};
pub use core::{
    CheckPreview, CheckRequest, CheckResponse, PreviewFreeTrial, PreviewProduct,
    PreviewProductProperties, PreviewProductScenario, PreviewScenario, PreviewTrialDuration,
    TrackRequest, TrackResponse,
};
pub use customer::{
    Customer, CustomerConfig, CustomerData, DeleteCustomerRequest, GetOrCreateCustomerRequest,
    ListCustomersParams, ListCustomersPlanFilter, ListCustomersResponse, ProcessorFilter, Purchase,
    Subscription, SubscriptionStatus, UpdateCustomerRequest,
};
pub use entity::{
    CreateEntityRequest, DeleteEntityRequest, Entity, EntityInvoice, GetEntityRequest,
    UpdateEntityRequest,
};
pub use events::{
    AggregateDataPoint, AggregateEventsRequest, AggregateEventsResponse, AggregateRange,
    AggregateTotal, BinSize, Event, ListEventsRequest, ListEventsResponse,
};
pub use feature::{
    CreateFeatureRequest, CreditSchemaEntry, DeleteFeatureRequest, Feature, FeatureDisplay,
    FeatureRef, FeatureRefType, FeatureType, GetFeatureRequest, ListFeaturesResponse,
    UpdateFeatureRequest,
};
pub use plan::{
    AttachAction, BillingMethod, CreatePlanRequest, CustomerEligibility, DeletePlanRequest,
    EligibilityStatus, FreeTrial, FreeTrialDuration, FreeTrialParams, GetPlanRequest,
    ListPlansParams, ListPlansResponse, Plan, PlanItem, PlanItemInput, PlanItemPriceInput,
    PlanItemPriceResponse, PlanItemTier, PlanProration, PlanRolloverInput, PlanRolloverResponse,
    ProrationOnDecrease, ProrationOnIncrease, RolloverDuration, TierBehavior, TierTo,
    UpdatePlanRequest,
};
pub use platform::{
    CreateOrganizationRequest, CreateOrganizationResponse, GenerateOAuthUrlRequest,
    GenerateOAuthUrlResponse, ListPlatformOrgsParams, ListPlatformOrgsResponse,
    ListPlatformUsersParams, ListPlatformUsersResponse, OAuthEnv, PlatformEnv, PlatformOrganization,
    PlatformUser, UpdateStripeConfigRequest, UpdateStripeConfigResponse, UpdateStripeOrganization,
};
pub use referrals::{
    CreateReferralCodeRequest, CreateReferralCodeResponse, RedeemReferralCodeRequest,
    RedeemReferralCodeResponse,
};
pub use shared::{
    AutoTopup, BasePrice, BasePriceResponse, BillingControls, BillingCycleAnchorNow,
    BillingInterval, CustomRange, Display, EntityBillingControls, Environment, FeatureIdFilter,
    Lock, LockEnabled, OverageAllowed, PurchaseLimit, PurchaseLimitInterval, Reset, ResetInterval,
    SpendLimit, SuccessResponse, ThresholdType, UsageAlert,
};
