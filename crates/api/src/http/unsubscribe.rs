use crate::{digest::verify_unsubscribe_token, error::ApiError, state::AppState};
use axum::{
    extract::{Query, State},
    response::Html,
    routing::get,
    Router,
};
use chrono::Utc;
use produktive_entity::notification_preference;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, Set,
};
use serde::Deserialize;

pub fn routes() -> Router<AppState> {
    Router::new().route("/progress", get(unsubscribe_progress))
}

#[derive(Deserialize)]
struct UnsubscribeParams {
    u: String,
    t: String,
}

async fn unsubscribe_progress(
    State(state): State<AppState>,
    Query(params): Query<UnsubscribeParams>,
) -> Result<Html<String>, ApiError> {
    if !verify_unsubscribe_token(&state.config.jwt_secret, &params.u, &params.t) {
        return Ok(Html(error_page("This unsubscribe link is invalid or expired.")));
    }

    let existing = notification_preference::Entity::find()
        .filter(notification_preference::Column::UserId.eq(&params.u))
        .one(&state.db)
        .await?;

    if let Some(prefs) = existing {
        let mut active = prefs.into_active_model();
        active.email_progress = Set(false);
        active.updated_at = Set(Utc::now().fixed_offset());
        active.update(&state.db).await?;
    }

    Ok(Html(success_page(&state.config.app_url)))
}

fn success_page(app_url: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Unsubscribed</title>\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d0d0f;color:#e6e6e6;display:grid;place-items:center;min-height:100vh;margin:0}}\
.card{{max-width:420px;padding:32px;border:1px solid #2a2a2f;border-radius:12px;text-align:center}}\
h1{{font-size:18px;margin:0 0 8px;font-weight:500}}\
p{{font-size:14px;color:#a0a0a8;margin:0 0 16px;line-height:1.5}}\
a{{color:#7aa7ff;text-decoration:none;font-size:13px}}\
a:hover{{text-decoration:underline}}</style></head>\
<body><div class=\"card\"><h1>You're unsubscribed</h1>\
<p>You won't receive any more progress emails. You can re-enable them anytime in your account settings.</p>\
<a href=\"{app_url}/account\">Open account settings</a></div></body></html>"
    )
}

fn error_page(message: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Unsubscribe</title>\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d0d0f;color:#e6e6e6;display:grid;place-items:center;min-height:100vh;margin:0}}\
.card{{max-width:420px;padding:32px;border:1px solid #2a2a2f;border-radius:12px;text-align:center}}\
h1{{font-size:18px;margin:0 0 8px;font-weight:500}}\
p{{font-size:14px;color:#a0a0a8;margin:0;line-height:1.5}}</style></head>\
<body><div class=\"card\"><h1>Unsubscribe failed</h1><p>{message}</p></div></body></html>"
    )
}
