use std::time::Duration;

use autumn_rs::models::{ListPlatformOrgsParams, ListPlatformOrgsResponse};
use autumn_rs::{Autumn, AutumnConfig, AutumnError};
use serde_json::json;
use wiremock::matchers::{body_json, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn sends_auth_and_api_version_headers() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/balances.check"))
        .and(header("authorization", "Bearer am_sk_test"))
        .and(header("x-api-version", "2.2.0"))
        .and(body_json(json!({
            "customer_id": "customer_123",
            "feature_id": "messages",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "allowed": true,
            "customer_id": "customer_123",
            "balance": null,
            "flag": null,
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(AutumnConfig::new("am_sk_test").base_url(server.uri()))
        .expect("client builds");
    let response = autumn
        .check("customer_123")
        .feature("messages")
        .send()
        .await
        .expect("check succeeds");

    assert!(response.allowed);
    assert!(response.balance.is_none());
    assert!(response.flag.is_none());
}

#[tokio::test]
async fn track_posts_to_balances_track() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/balances.track"))
        .and(body_json(json!({
            "customer_id": "customer_123",
            "feature_id": "messages",
            "value": 1.0,
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "customer_id": "customer_123",
            "value": 1.0,
            "balance": null,
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(AutumnConfig::new("am_sk_test").base_url(server.uri()))
        .expect("client builds");
    let response = autumn
        .track("customer_123")
        .feature("messages")
        .value(1.0)
        .send()
        .await
        .expect("track succeeds");

    assert_eq!(response.customer_id, "customer_123");
    assert_eq!(response.value, 1.0);
}

#[tokio::test]
async fn parses_api_errors_with_raw_body() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/balances.check"))
        .respond_with(ResponseTemplate::new(402).set_body_json(json!({
            "code": "payment_required",
            "message": "Payment required",
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(AutumnConfig::new("am_sk_test").base_url(server.uri()))
        .expect("client builds");
    let error = autumn
        .check("customer_123")
        .feature("messages")
        .send()
        .await
        .expect_err("check fails");

    match error {
        AutumnError::Api(error) => {
            assert_eq!(error.status.as_u16(), 402);
            assert_eq!(error.code.as_deref(), Some("payment_required"));
            assert_eq!(error.message, "Payment required");
            assert!(error.raw_body.contains("payment_required"));
        }
        other => panic!("unexpected error: {other:?}"),
    }
}

#[tokio::test]
async fn retries_transient_server_errors() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/balances.track"))
        .respond_with(ResponseTemplate::new(500))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/balances.track"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "customer_id": "customer_123",
            "value": 1.0,
            "balance": null,
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(
        AutumnConfig::new("am_sk_test")
            .base_url(server.uri())
            .max_retries(1)
            .timeout(Duration::from_secs(5)),
    )
    .expect("client builds");

    let response = autumn
        .track("customer_123")
        .feature("messages")
        .send()
        .await
        .expect("retry succeeds");

    assert_eq!(response.customer_id, "customer_123");
}

#[tokio::test]
async fn builder_rejects_missing_required_fields() {
    let autumn = Autumn::new("am_sk_test").expect("client builds");

    let error = autumn
        .check("customer_123")
        .send()
        .await
        .expect_err("missing feature_id");

    assert!(matches!(
        error,
        AutumnError::MissingRequiredField("feature_id")
    ));
}

#[tokio::test]
async fn config_debug_redacts_token() {
    let config = AutumnConfig::new("am_sk_secret_token");
    let debug = format!("{config:?}");

    assert!(debug.contains("[redacted]"));
    assert!(!debug.contains("am_sk_secret_token"));
}

#[tokio::test]
async fn attach_posts_to_billing_attach() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/billing.attach"))
        .and(body_json(json!({
            "customer_id": "customer_123",
            "plan_id": "pro",
            "success_url": "https://example.com/success",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "customer_id": "customer_123",
            "payment_url": "https://checkout.stripe.com/pay/cs_test_abc",
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(AutumnConfig::new("am_sk_test").base_url(server.uri()))
        .expect("client builds");
    let response = autumn
        .attach("customer_123")
        .plan("pro")
        .success_url("https://example.com/success")
        .send()
        .await
        .expect("attach succeeds");

    assert_eq!(response.customer_id, "customer_123");
    assert_eq!(
        response.payment_url.as_deref(),
        Some("https://checkout.stripe.com/pay/cs_test_abc")
    );
}

#[tokio::test]
async fn cancel_posts_billing_update_with_cancel_action() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/billing.update"))
        .and(body_json(json!({
            "customer_id": "customer_123",
            "plan_id": "pro",
            "cancel_action": "cancel_immediately",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "customer_id": "customer_123",
            "payment_url": null,
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(AutumnConfig::new("am_sk_test").base_url(server.uri()))
        .expect("client builds");
    autumn
        .cancel("customer_123")
        .plan("pro")
        .immediately()
        .send()
        .await
        .expect("cancel succeeds");
}

#[tokio::test]
async fn platform_list_organizations_uses_get_with_query_params() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/platform/organizations"))
        .and(query_param("limit", "20"))
        .and(query_param("offset", "0"))
        .and(header("x-api-version", "2.2.0"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "list": [
                {"slug": "tenant-a", "name": "Tenant A", "created_at": 1_700_000_000_000_i64}
            ],
            "total": 1,
            "limit": 20,
            "offset": 0
        })))
        .mount(&server)
        .await;

    let autumn = Autumn::with_config(AutumnConfig::new("am_sk_test").base_url(server.uri()))
        .expect("client builds");
    let response: ListPlatformOrgsResponse = autumn
        .platform()
        .list_organizations(ListPlatformOrgsParams {
            limit: Some(20),
            offset: Some(0),
        })
        .await
        .expect("list orgs succeeds");

    assert_eq!(response.list.len(), 1);
    assert_eq!(response.list[0].slug, "tenant-a");
}
