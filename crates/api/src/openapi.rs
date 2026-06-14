use axum::{routing::get, Json, Router};
use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};

use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "unstatus API",
        version = "0.1.0",
        description = "Uptime tracker API. Per-user workspaces, monitors (HTTP/TCP/Ping), and TimescaleDB-backed checks."
    ),
    paths(
        crate::http::health::health,
        crate::auth::routes::register,
        crate::auth::routes::login,
        crate::auth::routes::logout,
        crate::auth::routes::me,
        crate::http::workspaces::list,
        crate::http::workspaces::create,
        crate::http::workspaces::get_one,
        crate::http::workspaces::update,
        crate::http::workspaces::delete,
        crate::http::members::list,
        crate::http::members::update_role,
        crate::http::members::remove,
        crate::http::incidents::list,
        crate::http::incidents::create,
        crate::http::incidents::add_update,
        crate::http::notifications::list_notifications,
        crate::http::notifications::list_channels,
        crate::http::notifications::create_channel,
        crate::http::notifications::update_channel,
        crate::http::notifications::delete_channel,
        crate::http::notifications::test_channel,
        crate::http::notifications::list_channel_deliveries,
        crate::http::custom_domains::list,
        crate::http::custom_domains::create,
        crate::http::custom_domains::verify,
        crate::http::custom_domains::remove,
        crate::http::custom_domains::authorize,
        crate::http::billing::summary,
        crate::http::billing::get_customer,
        crate::http::billing::list_plans,
        crate::http::billing::attach,
        crate::http::billing::cancel_subscription,
        crate::http::billing::renew_subscription,
        crate::http::billing::cancel_downgrade,
        crate::http::billing::open_portal,
        crate::http::billing::setup_payment,
        crate::http::pricing::public_pricing,
        crate::http::regions::list,
        crate::http::invites::create,
        crate::http::invites::list,
        crate::http::invites::revoke,
        crate::http::invites::preview,
        crate::http::invites::accept,
        crate::http::monitors::list,
        crate::http::monitors::create,
        crate::http::monitors::get_one,
        crate::http::monitors::update,
        crate::http::monitors::delete,
        crate::http::monitors::dsl_validate,
        crate::http::monitors::dsl_test,
        crate::http::checks::list_checks,
        crate::http::checks::stats,
        crate::http::checks::latency_series,
        crate::http::public_status::get_status,
        crate::http::public_status::get_status_by_domain,
    ),
    components(schemas(
        crate::http::health::HealthResponse,
        crate::auth::routes::CredsPayload,
        crate::auth::routes::UserView,
        crate::auth::routes::RegisterResponse,
        crate::auth::routes::MeResponse,
        crate::auth::routes::AuthResponse,
        crate::auth::routes::OkResponse,
        crate::http::workspaces::WorkspaceView,
        crate::http::workspaces::CreateWorkspaceBody,
        crate::http::workspaces::UpdateWorkspaceBody,
        crate::http::members::MemberView,
        crate::http::members::UpdateRole,
        crate::http::incidents::IncidentView,
        crate::http::incidents::IncidentUpdateView,
        crate::http::incidents::CreateIncidentBody,
        crate::http::incidents::IncidentUpdateBody,
        crate::http::notifications::NotificationView,
        crate::http::notifications::NotificationChannelView,
        crate::http::notifications::NotificationDeliveryView,
        crate::http::notifications::CreateNotificationChannel,
        crate::http::notifications::UpdateNotificationChannel,
        crate::http::notifications::TestChannelResponse,
        crate::http::notifications::OkResponse,
        crate::http::custom_domains::CustomDomainView,
        crate::http::custom_domains::CreateCustomDomainBody,
        crate::http::custom_domains::AuthorizeCustomDomainQuery,
        crate::http::billing::BillingSummary,
        crate::http::billing::BillingPlanSummary,
        crate::http::billing::BillingPlanPriceSummary,
        crate::http::billing::BillingPlanItemSummary,
        crate::http::billing::BillingBalanceSummary,
        crate::http::billing::AttachBody,
        crate::http::billing::PortalBody,
        crate::http::billing::SetupPaymentBody,
        crate::http::pricing::PublicPricingResponse,
        crate::http::pricing::PublicPricingPlan,
        crate::http::pricing::PublicPlanPrice,
        crate::http::pricing::PublicPlanFeature,
        crate::http::pricing::PublicUsagePrice,
        crate::http::pricing::PublicPricingFeature,
        crate::regions::RegionView,
        crate::regions::MonitorRegionView,
        crate::http::invites::CreateInviteBody,
        crate::http::invites::InviteCreated,
        crate::http::invites::InviteRow,
        crate::http::invites::InvitePreview,
        crate::http::monitors::CreateMonitor,
        crate::http::monitors::UpdateMonitor,
        crate::http::monitors::MonitorView,
        crate::http::monitors::DslValidateBody,
        crate::http::monitors::DslValidateResponse,
        crate::http::monitors::DslError,
        crate::http::monitors::DslDiagnostic,
        crate::http::monitors::DslTestBody,
        crate::http::monitors::DslTestResponse,
        crate::http::monitors::DslOutcome,
        crate::http::checks::CheckRow,
        crate::http::checks::StatsResponse,
        crate::http::checks::LatencyPoint,
        crate::http::public_status::DayBucket,
        crate::http::public_status::PublicMonitor,
        crate::http::public_status::PublicGroup,
        crate::http::public_status::PublicIncident,
        crate::http::public_status::PublicIncidentUpdate,
        crate::http::public_status::StatusStyle,
        crate::http::public_status::PublicStatus,
        entity::user::Model,
        entity::session::Model,
        entity::workspace::Model,
        entity::workspace_member::Model,
        entity::workspace_member::WorkspaceRole,
        entity::workspace_invite::Model,
        entity::monitor::Model,
        entity::monitor::MonitorKind,
        entity::check::Model,
        entity::region::Model,
        entity::monitor_region::Model,
        entity::monitor_region_state::Model,
        entity::custom_domain::Model,
    )),
    tags(
        (name = "system",     description = "Health and metadata"),
        (name = "auth",       description = "Registration, login, sessions"),
        (name = "workspaces", description = "Workspaces (personal + teams)"),
        (name = "members",    description = "Workspace membership"),
        (name = "incidents",  description = "Private incident history"),
        (name = "notifications", description = "Notification history and channels"),
        (name = "custom domains", description = "Caddy-backed custom status domains"),
        (name = "billing", description = "Polar billing proxy"),
        (name = "pricing", description = "Public pricing metadata"),
        (name = "regions", description = "Probe regions"),
        (name = "invites",    description = "Workspace invites"),
        (name = "monitors",   description = "Monitor CRUD"),
        (name = "checks",     description = "Check history and uptime stats"),
        (name = "public",     description = "Public status pages"),
    ),
    modifiers(&SecurityAddon),
)]
pub struct ApiDoc;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi
            .components
            .as_mut()
            .expect("components registered by paths/schemas above");
        components.add_security_scheme(
            "bearerAuth",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .build(),
            ),
        );
    }
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/docs.json", get(spec))
}

async fn spec() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
