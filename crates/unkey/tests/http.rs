use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

use serde_json::Value;
use unkey_rs::models::{
    CreateApiRequest, CreateKeyRequest, CreateRoleRequest, LimitRequest, MigrateKey,
    MigrateKeyHash, MigrateKeyHashVariant, MigrateKeysRequest, UnkeyResponse, UpdateKeyRequest,
    VerifyKeyRequest,
};
use unkey_rs::{Unkey, UnkeyConfig, UnkeyError};

fn server_once(status: u16, body: &'static str) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
    let addr = listener.local_addr().expect("test server address");
    let base_url = format!("http://{addr}");

    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept request");
        stream
            .set_read_timeout(Some(Duration::from_millis(200)))
            .expect("set timeout");

        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => request.extend_from_slice(&buffer[..n]),
                Err(error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        || error.kind() == std::io::ErrorKind::TimedOut =>
                {
                    break;
                }
                Err(error) => panic!("read request: {error}"),
            }
        }

        let response = format!(
            "HTTP/1.1 {status} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write response");

        String::from_utf8(request).expect("request is utf8")
    });

    (base_url, handle)
}

fn body_json(request: &str) -> Value {
    let (_, body) = request.split_once("\r\n\r\n").expect("has body");
    serde_json::from_str(body).expect("valid json body")
}

#[tokio::test]
async fn create_api_uses_v2_rpc_path_and_headers() {
    let (base_url, handle) = server_once(
        200,
        r#"{"meta":{"requestId":"req_123"},"data":{"apiId":"api_123","name":"payments"}}"#,
    );
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");

    let result: UnkeyResponse<_> = unkey
        .apis()
        .create_api(CreateApiRequest {
            name: "payments".to_owned(),
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    assert!(request.starts_with("POST /v2/apis.createApi HTTP/1.1"));
    assert!(request.contains("authorization: Bearer root_test"));
    assert!(request.contains("content-type: application/json"));
    assert_eq!(body_json(&request)["name"], "payments");
    assert_eq!(result.meta.request_id.as_deref(), Some("req_123"));
    assert_eq!(result.data.api_id, "api_123");
}

#[tokio::test]
async fn create_key_serializes_camel_case_fields() {
    let (base_url, handle) = server_once(
        200,
        r#"{"meta":{},"data":{"key":"prod_abc","keyId":"key_123","apiId":"api_123"}}"#,
    );
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");

    let result = unkey
        .keys()
        .create_key(CreateKeyRequest {
            api_id: "api_123".to_owned(),
            prefix: Some("prod".to_owned()),
            name: Some("Production key".to_owned()),
            byte_length: Some(24),
            ..Default::default()
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    let body = body_json(&request);
    assert!(request.starts_with("POST /v2/keys.createKey HTTP/1.1"));
    assert_eq!(body["apiId"], "api_123");
    assert_eq!(body["byteLength"], 24);
    assert_eq!(result.data.key_id, "key_123");
}

#[tokio::test]
async fn verify_key_parses_authz_details() {
    let (base_url, handle) = server_once(
        200,
        r#"{"meta":{},"data":{"valid":true,"keyId":"key_123","ownerId":"user_123","remaining":9,"permissions":["documents.write"]}}"#,
    );
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");

    let result = unkey
        .keys()
        .verify_key(VerifyKeyRequest {
            key: "prod_abc".to_owned(),
            permissions: Some("documents.write".into()),
            ..Default::default()
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    assert!(request.starts_with("POST /v2/keys.verifyKey HTTP/1.1"));
    assert_eq!(body_json(&request)["permissions"], "documents.write");
    assert!(result.data.valid);
    assert_eq!(result.data.owner_id.as_deref(), Some("user_123"));
}

#[tokio::test]
async fn verify_key_handles_invalid_responses() {
    let (base_url, handle) = server_once(200, r#"{"meta":{},"data":{"valid":false}}"#);
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");

    let result = unkey
        .keys()
        .verify_key(VerifyKeyRequest {
            key: "prod_abc".to_owned(),
            ..Default::default()
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    assert!(request.starts_with("POST /v2/keys.verifyKey HTTP/1.1"));
    assert!(!result.data.valid);
}

#[tokio::test]
async fn update_key_serializes_enabled_false_for_revocation() {
    let (base_url, handle) = server_once(
        200,
        r#"{"meta":{},"data":{"keyId":"key_123","enabled":false}}"#,
    );
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");

    unkey
        .keys()
        .update_key(UpdateKeyRequest {
            key_id: "key_123".to_owned(),
            enabled: Some(false),
            ..Default::default()
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    let body = body_json(&request);
    assert!(request.starts_with("POST /v2/keys.updateKey HTTP/1.1"));
    assert_eq!(body["keyId"], "key_123");
    assert_eq!(body["enabled"], false);
}

#[tokio::test]
async fn migrate_keys_uses_v2_hash_shape_and_parses_results() {
    let (base_url, handle) = server_once(
        200,
        r#"{"meta":{},"data":{"migrated":[{"hash":"abc123","keyId":"key_123"}],"failed":[{"hash":"def456","error":"duplicate"}]}}"#,
    );
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");

    let result = unkey
        .keys()
        .migrate_keys(MigrateKeysRequest {
            migration_id: "mig_123".to_owned(),
            api_id: "api_123".to_owned(),
            keys: vec![MigrateKey {
                hash: MigrateKeyHash {
                    value: "abc123".to_owned(),
                    variant: MigrateKeyHashVariant::Sha256Hex,
                },
                prefix: Some("pk_api".to_owned()),
                name: Some("Legacy key".to_owned()),
                enabled: Some(true),
                ..Default::default()
            }],
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    let body = body_json(&request);
    assert!(request.starts_with("POST /v2/keys.migrateKeys HTTP/1.1"));
    assert_eq!(body["migrationId"], "mig_123");
    assert_eq!(body["keys"][0]["hash"]["value"], "abc123");
    assert_eq!(body["keys"][0]["hash"]["variant"], "sha256_hex");
    assert_eq!(body["keys"][0]["prefix"], "pk_api");
    assert_eq!(result.data.migrated[0].key_id, "key_123");
    assert_eq!(result.data.failed[0].hash, "def456");
}

#[tokio::test]
async fn transport_failure_is_returned_to_callers() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
    let base_url = format!(
        "http://{}",
        listener.local_addr().expect("test server address")
    );
    drop(listener);
    let unkey = Unkey::with_config(
        UnkeyConfig::new("root_test")
            .base_url(base_url)
            .max_retries(0),
    )
    .expect("client builds");

    let error = unkey
        .keys()
        .verify_key(VerifyKeyRequest {
            key: "prod_abc".to_owned(),
            ..Default::default()
        })
        .await
        .expect_err("request fails");

    assert!(matches!(error, UnkeyError::Http(_)));
}

#[tokio::test]
async fn create_role_and_ratelimit_limit_hit_expected_procedures() {
    let (base_url, handle) = server_once(200, r#"{"meta":{},"data":{"name":"content.editor"}}"#);
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");
    unkey
        .permissions()
        .create_role(CreateRoleRequest {
            name: "content.editor".to_owned(),
            description: None,
        })
        .await
        .expect("request succeeds");
    let request = handle.join().expect("server joins");
    assert!(request.starts_with("POST /v2/permissions.createRole HTTP/1.1"));

    let (base_url, handle) = server_once(
        200,
        r#"{"meta":{},"data":{"success":true,"limit":100,"remaining":99,"reset":1700000000}}"#,
    );
    let unkey = Unkey::with_config(UnkeyConfig::new("root_test").base_url(base_url))
        .expect("client builds");
    let result = unkey
        .ratelimit()
        .limit(LimitRequest {
            namespace: "api.requests".to_owned(),
            identifier: "user_123".to_owned(),
            limit: Some(100),
            duration: Some(60_000),
            cost: None,
            asynchronous: Some(true),
        })
        .await
        .expect("request succeeds");

    let request = handle.join().expect("server joins");
    let body = body_json(&request);
    assert!(request.starts_with("POST /v2/ratelimit.limit HTTP/1.1"));
    assert_eq!(body["async"], true);
    assert_eq!(result.data.remaining, 99);
}

#[tokio::test]
async fn api_errors_preserve_unkey_error_details() {
    let (base_url, _handle) = server_once(
        401,
        r#"{"meta":{"requestId":"req_bad"},"error":{"title":"Unauthorized","detail":"The provided root key is invalid","status":401,"type":"https://unkey.com/docs/errors/unauthorized"}}"#,
    );
    let unkey =
        Unkey::with_config(UnkeyConfig::new("bad").base_url(base_url)).expect("client builds");

    let error = unkey
        .apis()
        .create_api(CreateApiRequest {
            name: "payments".to_owned(),
        })
        .await
        .expect_err("request fails");

    match error {
        UnkeyError::Api(error) => {
            assert_eq!(error.status.as_u16(), 401);
            assert_eq!(error.request_id.as_deref(), Some("req_bad"));
            assert_eq!(error.message, "The provided root key is invalid");
        }
        other => panic!("unexpected error: {other:?}"),
    }
}
