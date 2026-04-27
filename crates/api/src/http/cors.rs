use crate::config::Config;
use axum::http::{header, HeaderValue, Method};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub fn cors_layer(config: &Config) -> CorsLayer {
    let origins = config.cors_origins.clone();

    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin, _| {
            origin
                .to_str()
                .map(|origin| {
                    origins
                        .iter()
                        .any(|allowed| origin_matches(allowed, origin))
                })
                .unwrap_or(false)
        }))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_credentials(true)
}

fn origin_matches(allowed: &str, origin: &str) -> bool {
    if allowed == origin {
        return true;
    }

    if let Some((prefix, suffix)) = allowed.split_once('*') {
        if !origin.starts_with(prefix) || !origin.ends_with(suffix) {
            return false;
        }

        let wildcard = &origin[prefix.len()..origin.len() - suffix.len()];
        return !wildcard.is_empty() && !wildcard.contains('.');
    }

    HeaderValue::from_str(allowed).is_ok() && allowed == origin
}
