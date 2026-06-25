use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use chrono::Utc;
use entity::{custom_domain, workspace_member::WorkspaceRole};
use rand::RngCore;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    billing::{ensure_customer, load_owner_email, require_boolean_feature},
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{id}", delete(remove))
        .route("/{id}/verify", post(verify))
}

#[derive(Serialize, ToSchema)]
pub struct CustomDomainView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub hostname: String,
    pub verification_name: String,
    pub verification_value: String,
    pub verified_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub ssl_status: Option<String>,
    pub cname_target: String,
    /// `_acme-challenge.<host>` CNAME target for auto-renewing TXT DCV delegation.
    /// `None` when the zone DCV-delegation UUID isn't configured.
    pub dcv_delegation_target: Option<String>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub updated_at: chrono::DateTime<chrono::FixedOffset>,
}

impl CustomDomainView {
    fn build(row: custom_domain::Model, state: &AppState) -> Self {
        let dcv_delegation_target = state
            .config
            .cf_dcv_delegation_uuid
            .as_ref()
            .map(|uuid| format!("{}.{}.dcv.cloudflare.com", row.hostname, uuid));
        Self {
            id: row.id,
            workspace_id: row.workspace_id,
            hostname: row.hostname,
            verification_name: row.verification_name,
            verification_value: row.verification_value,
            verified_at: row.verified_at,
            ssl_status: row.ssl_status,
            cname_target: state.config.custom_domain_cname_target.clone(),
            dcv_delegation_target,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct CreateCustomDomainBody {
    pub hostname: String,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/custom-domains",
    operation_id = "custom_domains_list",
    params(("wid" = Uuid, Path, description = "workspace id")),
    responses((status = 200, body = [CustomDomainView])),
    security(("bearerAuth" = [])),
    tag = "custom domains"
)]
pub async fn list(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<CustomDomainView>>> {
    let rows = custom_domain::Entity::find()
        .filter(custom_domain::Column::WorkspaceId.eq(m.workspace.id))
        .all(&state.db)
        .await?;
    Ok(Json(
        rows.into_iter()
            .map(|row| CustomDomainView::build(row, &state))
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/custom-domains",
    operation_id = "custom_domains_create",
    params(("wid" = Uuid, Path, description = "workspace id")),
    request_body = CreateCustomDomainBody,
    responses(
        (status = 200, body = CustomDomainView),
        (status = 400, description = "Invalid hostname"),
        (status = 403, description = "Owner only"),
        (status = 409, description = "Domain already added"),
    ),
    security(("bearerAuth" = [])),
    tag = "custom domains"
)]
pub async fn create(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Json(body): Json<CreateCustomDomainBody>,
) -> ApiResult<Json<CustomDomainView>> {
    require_owner(m.role)?;
    if !m.workspace.status_page_enabled {
        return Err(ApiError::bad_request(
            "enable the public status page before adding a custom domain",
        ));
    }
    let hostname = normalize_domain(&body.hostname)
        .ok_or_else(|| ApiError::bad_request("hostname must be a valid domain"))?;
    if hostname == state.config.custom_domain_cname_target {
        return Err(ApiError::bad_request(
            "custom domain cannot be the proxy CNAME target",
        ));
    }

    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;
    require_boolean_feature(&state, m.workspace.id, "custom_domain").await?;

    let domain_id = Uuid::now_v7();
    let now = Utc::now().fixed_offset();
    let verification_name = verification_name(&hostname);
    let verification_value = verification_value();
    let row = custom_domain::ActiveModel {
        id: Set(domain_id),
        workspace_id: Set(m.workspace.id),
        hostname: Set(hostname),
        verification_name: Set(verification_name),
        verification_value: Set(verification_value),
        verified_at: Set(None),
        cf_hostname_id: Set(None),
        ssl_status: Set(None),
        cf_synced_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(map_unique_err)?;

    // Register the hostname with Cloudflare for SaaS so Cloudflare issues and
    // auto-renews the TLS cert. We use TXT DCV (delegation-friendly) because the
    // edge Worker intercepts the HTTP `.well-known` validation paths. If the row
    // inserted but Cloudflare rejects it, roll back so the user can retry cleanly.
    if let Some(cf) = state.cloudflare.as_ref() {
        match cf.create_custom_hostname(&row.hostname, "txt").await {
            Ok(ch) => {
                let ssl_status = ch.ssl_status().map(str::to_owned);
                let mut am: custom_domain::ActiveModel = row.into();
                am.cf_hostname_id = Set(Some(ch.id));
                am.ssl_status = Set(ssl_status);
                am.updated_at = Set(Utc::now().fixed_offset());
                let row = am.update(&state.db).await?;
                return Ok(Json(CustomDomainView::build(row, &state)));
            }
            Err(err) => {
                let _ = custom_domain::Entity::delete_by_id(row.id)
                    .exec(&state.db)
                    .await;
                tracing::error!(error = %err, "failed to register Cloudflare custom hostname");
                return Err(ApiError::bad_request(
                    "could not register the domain with our TLS provider; please try again",
                ));
            }
        }
    }

    Ok(Json(CustomDomainView::build(row, &state)))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/custom-domains/{id}/verify",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("id" = Uuid, Path, description = "custom domain id"),
    ),
    responses(
        (status = 200, body = CustomDomainView),
        (status = 400, description = "TXT verification record was not found"),
        (status = 403, description = "Owner only"),
    ),
    security(("bearerAuth" = [])),
    tag = "custom domains"
)]
pub async fn verify(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, Uuid)>,
) -> ApiResult<Json<CustomDomainView>> {
    require_owner(m.role)?;
    let row = custom_domain::Entity::find_by_id(id)
        .filter(custom_domain::Column::WorkspaceId.eq(m.workspace.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("custom domain not found"))?;

    let now = Utc::now().fixed_offset();

    // Cloudflare-backed domains: refresh the cert status from Cloudflare rather
    // than doing a DNS TXT lookup. Verified once Cloudflare reports `active`.
    if let (Some(cf), Some(cf_id)) = (state.cloudflare.as_ref(), row.cf_hostname_id.clone()) {
        let ssl_status = match cf.get_custom_hostname(&cf_id).await {
            Ok(Some(ch)) => ch.ssl_status().map(str::to_owned),
            Ok(None) => None,
            Err(err) => {
                tracing::error!(error = %err, "failed to fetch Cloudflare custom hostname");
                return Err(ApiError::service_unavailable(
                    "could not reach our TLS provider; please try again",
                ));
            }
        };
        let active = ssl_status.as_deref() == Some("active");
        let mut am: custom_domain::ActiveModel = row.into();
        am.ssl_status = Set(ssl_status);
        am.cf_synced_at = Set(Some(now));
        if active {
            am.verified_at = Set(Some(now));
        }
        am.updated_at = Set(now);
        let row = am.update(&state.db).await?;
        return Ok(Json(CustomDomainView::build(row, &state)));
    }

    if !dns_txt_contains(&state, &row.verification_name, &row.verification_value).await? {
        return Err(ApiError::bad_request(
            "TXT verification record was not found",
        ));
    }

    let mut am: custom_domain::ActiveModel = row.into();
    am.verified_at = Set(Some(now));
    am.updated_at = Set(now);
    let row = am.update(&state.db).await?;
    Ok(Json(CustomDomainView::build(row, &state)))
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/custom-domains/{id}",
    operation_id = "custom_domains_remove",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("id" = Uuid, Path, description = "custom domain id"),
    ),
    responses((status = 200, body = crate::http::workspaces::OkResponse)),
    security(("bearerAuth" = [])),
    tag = "custom domains"
)]
pub async fn remove(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, Uuid)>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    require_owner(m.role)?;
    let row = custom_domain::Entity::find_by_id(id)
        .filter(custom_domain::Column::WorkspaceId.eq(m.workspace.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("custom domain not found"))?;
    if let (Some(cf), Some(cf_id)) = (state.cloudflare.as_ref(), row.cf_hostname_id.as_deref()) {
        if let Err(err) = cf.delete_custom_hostname(cf_id).await {
            tracing::warn!(error = %err, cf_id, "failed to delete Cloudflare custom hostname (continuing)");
        }
    }
    custom_domain::Entity::delete_by_id(row.id)
        .exec(&state.db)
        .await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

fn require_owner(role: WorkspaceRole) -> ApiResult<()> {
    match role {
        WorkspaceRole::Owner => Ok(()),
        WorkspaceRole::Member => Err(ApiError::Forbidden),
    }
}

pub fn host_from_headers(headers: &HeaderMap) -> Option<String> {
    // Behind the custom-domain edge proxy (Cloudflare Worker / Caddy), `Host` is
    // rewritten to the app origin and the real hostname rides in `X-Forwarded-Host`.
    // Prefer that when the proxy flag is set; otherwise fall back to `Host` (direct
    // access / local dev). Mirrors spa_meta::host_domain so summary-by-host and the
    // SPA meta routes resolve custom domains identically.
    let is_proxied = headers
        .get("x-produktive-is-custom-domain")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let raw = if is_proxied {
        header_value(headers, "x-forwarded-host").or_else(|| header_value(headers, "host"))
    } else {
        header_value(headers, "host")
    }?;
    normalize_domain(&raw)
}

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let value = headers.get(name)?.to_str().ok()?;
    let value = value.rsplit_once(':').map_or(value, |(h, _)| h);
    Some(value.to_owned())
}

pub(super) fn normalize_domain(input: &str) -> Option<String> {
    let s = input.trim().trim_end_matches('.').to_lowercase();
    if !(1..=253).contains(&s.len()) || s.contains("..") {
        return None;
    }
    let mut count = 0;
    for label in s.split('.') {
        count += 1;
        if label.is_empty()
            || label.len() > 63
            || label.starts_with('-')
            || label.ends_with('-')
            || !label
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return None;
        }
    }
    if count < 2 {
        return None;
    }
    Some(s)
}

fn map_unique_err(e: sea_orm::DbErr) -> ApiError {
    let s = e.to_string();
    if s.contains("idx_custom_domains_hostname") || s.contains("duplicate key") {
        return ApiError::conflict("custom domain already added");
    }
    ApiError::from(e)
}

fn verification_name(hostname: &str) -> String {
    format!("_produktive.{hostname}")
}

fn verification_value() -> String {
    let mut buf = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    format!("produktive-verification={}", hex::encode(buf))
}

#[derive(Deserialize)]
struct DnsTxtResponse {
    #[serde(rename = "Answer")]
    answer: Option<Vec<DnsTxtAnswer>>,
}

#[derive(Deserialize)]
struct DnsTxtAnswer {
    data: String,
}

async fn dns_txt_contains(state: &AppState, name: &str, expected: &str) -> ApiResult<bool> {
    let response = state
        .http
        .get("https://dns.google/resolve")
        .query(&[("name", name), ("type", "TXT")])
        .send()
        .await
        .map_err(|err| {
            tracing::warn!(error = ?err, name, "DNS verification lookup failed");
            ApiError::service_unavailable("DNS verification lookup failed")
        })?;
    if !response.status().is_success() {
        tracing::warn!(status = ?response.status(), name, "DNS verification lookup returned an error");
        return Err(ApiError::service_unavailable(
            "DNS verification lookup failed",
        ));
    }
    let payload = response.json::<DnsTxtResponse>().await.map_err(|err| {
        tracing::warn!(error = ?err, name, "DNS verification response could not be parsed");
        ApiError::service_unavailable("DNS verification lookup failed")
    })?;

    Ok(payload
        .answer
        .unwrap_or_default()
        .iter()
        .any(|answer| txt_matches(&answer.data, expected)))
}

fn txt_matches(actual: &str, expected: &str) -> bool {
    actual.trim().trim_matches('"') == expected
        || actual
            .split_whitespace()
            .map(|part| part.trim_matches('"'))
            .collect::<String>()
            == expected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_valid_domains() {
        assert_eq!(
            normalize_domain(" Status.Example.COM. "),
            Some("status.example.com".to_string())
        );
        assert_eq!(
            normalize_domain("example.com"),
            Some("example.com".to_string())
        );
    }

    #[test]
    fn rejects_invalid_domains() {
        for input in [
            "localhost",
            "-example.com",
            "example-.com",
            "ex..com",
            "",
            "bad_domain.com",
        ] {
            assert_eq!(normalize_domain(input), None, "{input}");
        }
    }

    #[test]
    fn builds_dns_verification_records() {
        assert_eq!(
            verification_name("status.example.com"),
            "_produktive.status.example.com"
        );
        assert!(verification_value().starts_with("produktive-verification="));
    }

    #[test]
    fn matches_quoted_txt_records() {
        assert!(txt_matches(
            "\"produktive-verification=abc123\"",
            "produktive-verification=abc123"
        ));
        assert!(txt_matches(
            "\"produktive-\" \"verification=abc123\"",
            "produktive-verification=abc123"
        ));
        assert!(!txt_matches(
            "\"produktive-verification=other\"",
            "produktive-verification=abc123"
        ));
    }
}
