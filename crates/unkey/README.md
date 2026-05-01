# unkey-rs

Async Rust SDK for the Unkey v2 API. The API mirrors the official TypeScript
SDK's resource layout while using idiomatic Rust method names.

```rust
use unkey_rs::{models::CreateApiRequest, Unkey};

# async fn run() -> unkey_rs::Result<()> {
let unkey = Unkey::new("unkey_root_...")?;

let api = unkey
    .apis()
    .create_api(CreateApiRequest {
        name: "payment-service-production".to_owned(),
    })
    .await?;

println!("api id: {}", api.data.api_id);
# Ok(())
# }
```

## TypeScript Mapping

```ts
await unkey.keys.createKey({ apiId, name });
await unkey.keys.verifyKey({ key });
await unkey.ratelimit.limit({ namespace, identifier });
```

```rust
use unkey_rs::models::{CreateKeyRequest, LimitRequest, VerifyKeyRequest};

# async fn run(unkey: unkey_rs::Unkey) -> unkey_rs::Result<()> {
let created = unkey
    .keys()
    .create_key(CreateKeyRequest {
        api_id: "api_123".to_owned(),
        name: Some("Production key".to_owned()),
        prefix: Some("prod".to_owned()),
        ..Default::default()
    })
    .await?;

let verified = unkey
    .keys()
    .verify_key(VerifyKeyRequest {
        key: created.data.key,
        ..Default::default()
    })
    .await?;

let limited = unkey
    .ratelimit()
    .limit(LimitRequest {
        namespace: "api.requests".to_owned(),
        identifier: "user_123".to_owned(),
        limit: Some(100),
        duration: Some(60_000),
        cost: None,
        asynchronous: None,
    })
    .await?;

println!("valid={} allowed={}", verified.data.valid, limited.data.success);
# Ok(())
# }
```

## Configuration

```rust
use std::time::Duration;
use unkey_rs::{Unkey, UnkeyConfig};

# fn build() -> unkey_rs::Result<Unkey> {
let unkey = Unkey::with_config(
    UnkeyConfig::new("unkey_root_...")
        .base_url("https://api.unkey.com")
        .timeout(Duration::from_secs(10))
        .max_retries(1),
)?;
# Ok(unkey)
# }
```
