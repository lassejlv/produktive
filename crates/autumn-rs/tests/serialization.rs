use autumn_rs::models::{
    AttachRequest, CheckRequest, FeatureType, GetOrCreateCustomerRequest, Lock, TrackRequest,
    UpdateFeatureRequest,
};
use serde_json::json;

#[test]
fn serializes_attach_request() {
    let request = AttachRequest {
        customer_id: "customer_123".to_owned(),
        plan_id: "pro".to_owned(),
        success_url: Some("https://example.com/success".to_owned()),
        ..AttachRequest::default()
    };

    assert_eq!(
        serde_json::to_value(request).expect("serializes"),
        json!({
            "customer_id": "customer_123",
            "plan_id": "pro",
            "success_url": "https://example.com/success",
        })
    );
}

#[test]
fn serializes_check_request() {
    let request = CheckRequest {
        customer_id: "customer_123".to_owned(),
        feature_id: Some("messages".to_owned()),
        required_balance: Some(1.0),
        ..CheckRequest::default()
    };

    assert_eq!(
        serde_json::to_value(request).expect("serializes"),
        json!({
            "customer_id": "customer_123",
            "feature_id": "messages",
            "required_balance": 1.0,
        })
    );
}

#[test]
fn serializes_track_request() {
    let request = TrackRequest {
        customer_id: "customer_123".to_owned(),
        feature_id: Some("messages".to_owned()),
        value: Some(1.0),
        ..TrackRequest::default()
    };

    assert_eq!(
        serde_json::to_value(request).expect("serializes"),
        json!({
            "customer_id": "customer_123",
            "feature_id": "messages",
            "value": 1.0,
        })
    );
}

#[test]
fn lock_enabled_serializes_true_literal() {
    let lock = Lock::new("lock_abc").expires_at(1_700_000_000_000);
    assert_eq!(
        serde_json::to_value(lock).expect("serializes"),
        json!({
            "lock_id": "lock_abc",
            "enabled": true,
            "expires_at": 1_700_000_000_000_i64,
        })
    );
}

#[test]
fn get_or_create_customer_serializes_customer_id_field() {
    let request = GetOrCreateCustomerRequest {
        customer_id: Some("customer_123".to_owned()),
        email: Some("user@example.com".to_owned()),
        ..GetOrCreateCustomerRequest::default()
    };

    assert_eq!(
        serde_json::to_value(request).expect("serializes"),
        json!({
            "customer_id": "customer_123",
            "email": "user@example.com",
        })
    );
}

#[test]
fn null_customer_id_round_trips() {
    let request = GetOrCreateCustomerRequest {
        customer_id: None,
        ..GetOrCreateCustomerRequest::default()
    };

    let value = serde_json::to_value(&request).expect("serializes");
    assert_eq!(value, json!({ "customer_id": null }));
}

#[test]
fn feature_type_round_trips_credit_system() {
    let request = UpdateFeatureRequest {
        feature_id: "credits".to_owned(),
        kind: Some(FeatureType::CreditSystem),
        ..UpdateFeatureRequest::default()
    };

    let value = serde_json::to_value(request).expect("serializes");
    assert_eq!(
        value,
        json!({
            "feature_id": "credits",
            "type": "credit_system",
        })
    );
}
