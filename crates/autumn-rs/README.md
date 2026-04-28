# autumn-rs

Async Rust SDK for the [Autumn](https://useautumn.com) Billing API. Targets
Autumn API v2.2.0 — every core endpoint is `POST` to a dot-namespaced path
(e.g. `/v1/balances.check`, `/v1/customers.list`).

## Installation

```toml
[dependencies]
autumn-rs = "0.2"
```

Inside this workspace:

```toml
autumn-rs = { path = "crates/autumn-rs" }
```

## Quickstart

```rust
use autumn_rs::Autumn;

# async fn run() -> autumn_rs::Result<()> {
let autumn = Autumn::new("am_sk_test_...")?;

let check = autumn.check("customer_123").feature("messages").send().await?;
if check.allowed {
    autumn
        .track("customer_123")
        .feature("messages")
        .value(1.0)
        .send()
        .await?;
}
# Ok(())
# }
```

## Check + Track

```rust
use autumn_rs::Autumn;

# async fn run() -> autumn_rs::Result<()> {
let autumn = Autumn::new("am_sk_test_...")?;

let res = autumn
    .check("customer_123")
    .feature("messages")
    .required_balance(1.0)
    .send()
    .await?;

if res.allowed {
    autumn
        .track("customer_123")
        .feature("messages")
        .value(1.0)
        .send()
        .await?;
}
# Ok(())
# }
```

## Attach a plan

```rust
# async fn run() -> autumn_rs::Result<()> {
let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;

let result = autumn
    .attach("customer_123")
    .plan("pro")
    .success_url("https://example.com/success")
    .send()
    .await?;

if let Some(url) = result.payment_url {
    println!("Redirect to {url}");
}
# Ok(())
# }
```

`attach` covers new subscriptions, upgrades, and downgrades. The response's
`payment_url` is the Stripe Checkout URL when a redirect is required.

## Cancel

```rust
# async fn run() -> autumn_rs::Result<()> {
let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;

autumn
    .cancel("customer_123")
    .plan("pro")
    .end_of_cycle()
    .send()
    .await?;
# Ok(())
# }
```

`.immediately()`, `.end_of_cycle()` (default), and `.uncancel()` map to the
v2 `cancel_action` field on `/v1/billing.update`.

## Resources

```rust
# async fn run() -> autumn_rs::Result<()> {
let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;

// Customers
let _customers = autumn.customers().list(Default::default()).await?;

// Plans (renamed from "products" in v2)
let _plans = autumn.plans().list(Default::default()).await?;

// Features
let _features = autumn.features().list().await?;

// Events: timeseries usage queries
use autumn_rs::models::{AggregateEventsRequest, AggregateRange, FeatureIdFilter};
let _aggregate = autumn
    .events()
    .aggregate(AggregateEventsRequest {
        feature_id: FeatureIdFilter::One("messages".to_owned()),
        customer_id: Some("customer_123".to_owned()),
        range: Some(AggregateRange::Last7Days),
        bin_size: None,
        custom_range: None,
        entity_id: None,
        group_by: None,
        filter_by: Default::default(),
        max_groups: None,
    })
    .await?;
# Ok(())
# }
```

The full set of resource accessors: `balances()`, `billing()`, `customers()`,
`entities()`, `events()`, `features()`, `plans()`, `referrals()`, `platform()`.

## Custom configuration

```rust
use std::time::Duration;
use autumn_rs::{Autumn, AutumnConfig};

# fn build() -> autumn_rs::Result<Autumn> {
let autumn = Autumn::with_config(
    AutumnConfig::new("am_sk_test_...")
        .base_url("https://billing.example.com/v1")
        .timeout(Duration::from_secs(10))
        .max_retries(3)
        .user_agent("my-service/1.0"),
)?;
# Ok(autumn)
# }
```

## Error handling

```rust
# async fn run() -> autumn_rs::Result<()> {
let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;

match autumn.check("customer_123").feature("messages").send().await {
    Ok(check) if check.allowed => {}
    Ok(_) => println!("Not allowed"),
    Err(autumn_rs::AutumnError::Api(error)) => {
        eprintln!("Autumn API error {}: {}", error.status, error.message);
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

## Notes

- Auth uses `Authorization: Bearer <token>`.
- Default base URL: `https://api.useautumn.com/v1`.
- `X-Api-Version: 2.2.0` is sent on every request.
- All core operations are `POST` (Autumn's v2 API uses dot-namespaced paths
  rather than REST verbs). The platform sub-API uses standard REST verbs.
