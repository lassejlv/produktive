//! Server-side `<title>`/meta injection for public status pages.
//!
//! The SPA ships one global title and OG description, so a link to
//! `status.acme.com` (or `/s/acme`) unfurls as produktive marketing copy instead
//! of "Acme — Status". These routes sit in front of the static `ServeDir`
//! fallback and rewrite the built `index.html` per workspace before serving
//! it. Lookups are best-effort: any miss or DB error serves the stock shell
//! and the SPA renders its own not-found state.

use axum::{
    extract::{Path, State},
    http::{header, HeaderMap},
    response::{Html, IntoResponse, Response},
    routing::get,
    Extension, Router,
};
use entity::{custom_domain, workspace};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use std::sync::Arc;

use super::custom_domains::normalize_domain;
use crate::state::AppState;

#[derive(Clone)]
struct SpaIndex(Arc<String>);

pub fn routes(index_html: String) -> Router<AppState> {
    Router::new()
        // Slug-addressed status pages on the app origin.
        .route("/s/{slug}", get(slug_html))
        .route("/s/{slug}/incidents", get(slug_html))
        .route("/s/{slug}/incidents/{id}", get(slug_incident_html))
        // Custom domains serve the status page from the root path (and their
        // incident history from /incidents); on the app origin these fall
        // through to the stock shell.
        .route("/", get(domain_html))
        .route("/incidents", get(domain_html))
        .route("/incidents/{id}", get(domain_html))
        .layer(Extension(SpaIndex(Arc::new(index_html))))
}

async fn slug_html(
    State(state): State<AppState>,
    Extension(idx): Extension<SpaIndex>,
    Path(slug): Path<String>,
) -> Response {
    slug_html_for(&state, &idx, slug).await
}

async fn slug_incident_html(
    State(state): State<AppState>,
    Extension(idx): Extension<SpaIndex>,
    Path(path): Path<SlugIncidentPath>,
) -> Response {
    slug_html_for(&state, &idx, path.slug).await
}

#[derive(serde::Deserialize)]
struct SlugIncidentPath {
    slug: String,
    #[allow(dead_code)]
    id: String,
}

async fn slug_html_for(state: &AppState, idx: &SpaIndex, slug: String) -> Response {
    let slug = slug.trim().to_lowercase();
    let ws = workspace::Entity::find()
        .filter(workspace::Column::StatusSlug.eq(&slug))
        .filter(workspace::Column::StatusPageEnabled.eq(true))
        .one(&state.db)
        .await
        .ok()
        .flatten();
    respond(idx, ws)
}

async fn domain_html(
    State(state): State<AppState>,
    Extension(idx): Extension<SpaIndex>,
    headers: HeaderMap,
) -> Response {
    let ws = match host_domain(&headers) {
        Some(domain) => match custom_domain::Entity::find()
            .filter(custom_domain::Column::Hostname.eq(domain))
            .filter(custom_domain::Column::VerifiedAt.is_not_null())
            .one(&state.db)
            .await
            .ok()
            .flatten()
        {
            Some(custom) => workspace::Entity::find_by_id(custom.workspace_id)
                .filter(workspace::Column::StatusPageEnabled.eq(true))
                .one(&state.db)
                .await
                .ok()
                .flatten(),
            None => None,
        },
        None => None,
    };
    respond(&idx, ws)
}

/// The request's hostname, normalized — `None` for anything that can't be a
/// custom status domain.
///
/// When the request arrives via the custom-domain TLS proxy (Caddy), the
/// `Host` header is normalized to the app origin so the backend can't see the
/// real hostname. The proxy flags this with
/// `X-Produktive-Is-Custom-Domain: true` and preserves the original host in
/// `X-Forwarded-Host`. Prefer that forwarded host when the flag is present;
/// fall back to `Host` for direct access / local dev.
fn host_domain(headers: &HeaderMap) -> Option<String> {
    let host = if is_custom_domain_proxy(headers) {
        header_host(headers, "x-forwarded-host").or_else(|| header_host(headers, "host"))
    } else {
        header_host(headers, "host")
    };
    host.as_deref().and_then(normalize_domain)
}

/// Read a host-valued header, stripping any `:port` suffix.
fn header_host(headers: &HeaderMap, name: &str) -> Option<String> {
    let host = headers.get(name)?.to_str().ok()?;
    let host = host.rsplit_once(':').map_or(host, |(h, _)| h);
    Some(host.to_owned())
}

/// True when the request came through the custom-domain TLS proxy, which
/// rewrites `Host` to the app origin and sets `X-Produktive-Is-Custom-Domain`.
fn is_custom_domain_proxy(headers: &HeaderMap) -> bool {
    headers
        .get("x-produktive-is-custom-domain")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn respond(idx: &SpaIndex, ws: Option<workspace::Model>) -> Response {
    let html = match ws {
        Some(ws) => inject_meta(&idx.0, &ws),
        None => idx.0.as_ref().clone(),
    };
    ([(header::CACHE_CONTROL, "no-cache")], Html(html)).into_response()
}

fn inject_meta(html: &str, ws: &workspace::Model) -> String {
    let title = ws
        .status_page_title
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .unwrap_or(&ws.name);
    // "Acme" → "Acme — Status", but don't produce "Acme Status — Status".
    let tab_title = if title.to_lowercase().contains("status") {
        title.to_string()
    } else {
        format!("{title} — Status")
    };
    let description = ws
        .status_page_description
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Live availability and incident history for {title}."));

    let tab_title = escape_html(&tab_title);
    let description = escape_html(&description);

    let out = set_title(html, &tab_title);
    let out = set_meta_content(&out, "name=\"description\"", &description);
    let out = set_meta_content(&out, "property=\"og:title\"", &tab_title);
    set_meta_content(&out, "property=\"og:description\"", &description)
}

fn set_title(html: &str, value: &str) -> String {
    let Some(start) = html.find("<title>") else {
        return html.to_string();
    };
    let inner = start + "<title>".len();
    let Some(end_rel) = html[inner..].find("</title>") else {
        return html.to_string();
    };
    format!("{}{}{}", &html[..inner], value, &html[inner + end_rel..])
}

/// Replace the `content="…"` value of the meta tag identified by `marker`
/// (e.g. `property="og:title"`). The content attribute must appear after the
/// marker and before the tag closes; otherwise the html is returned unchanged.
fn set_meta_content(html: &str, marker: &str, value: &str) -> String {
    let Some(mpos) = html.find(marker) else {
        return html.to_string();
    };
    let Some(tag_end_rel) = html[mpos..].find('>') else {
        return html.to_string();
    };
    let scope = &html[mpos..mpos + tag_end_rel];
    let Some(cstart_rel) = scope.find("content=\"") else {
        return html.to_string();
    };
    let vstart = mpos + cstart_rel + "content=\"".len();
    let Some(vlen) = html[vstart..].find('"') else {
        return html.to_string();
    };
    format!("{}{}{}", &html[..vstart], value, &html[vstart + vlen..])
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::{set_meta_content, set_title};

    const SHELL: &str = r#"<!doctype html>
<html>
  <head>
    <title>produktive — uptime monitoring</title>
    <meta
      name="description"
      content="Probe HTTP, TCP, ICMP."
    />
    <meta property="og:title" content="produktive — uptime monitoring" />
    <meta property="og:description" content="Probe HTTP, TCP, ICMP." />
  </head>
  <body></body>
</html>"#;

    #[test]
    fn rewrites_title_and_meta() {
        let out = set_title(SHELL, "Acme — Status");
        assert!(out.contains("<title>Acme — Status</title>"));
        assert!(!out.contains("<title>produktive"));

        let out = set_meta_content(&out, "property=\"og:title\"", "Acme — Status");
        assert!(out.contains(r#"property="og:title" content="Acme — Status""#));

        // The multi-line description tag is rewritten too.
        let out = set_meta_content(&out, "name=\"description\"", "Acme uptime.");
        assert!(out.contains(r#"content="Acme uptime.""#));
        // og:description untouched by the name="description" rewrite.
        assert!(out.contains(r#"property="og:description" content="Probe HTTP, TCP, ICMP.""#));
    }

    #[test]
    fn missing_markers_leave_html_unchanged() {
        assert_eq!(set_title("<html></html>", "X"), "<html></html>");
        assert_eq!(
            set_meta_content("<html></html>", "property=\"og:title\"", "X"),
            "<html></html>"
        );
    }
}
