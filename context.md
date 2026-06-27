# Context

## User request

The billing UI showed a suspiciously high `deploy_cpu` metered charge. The user asked to investigate using the global `POLAR_UNSTATUS_KEY` environment variable to fetch live unit prices from Polar.

## Repository

- Path: `/Users/lassevestergaard/Documents/dev/unstatus`
- Stack: Rust workspace plus Bun/Vite React frontend
- Relevant package: `crates/api` / Cargo package `produktive-api`

## Investigation summary

The screenshot showed:

- `deploy_cpu`: `$1.24`
- `deploy_memory`: `$0.31`
- `deploy_volume`: `$0.02`

The backend deploy usage path was traced through:

- `crates/api/src/billing/deploy_usage.rs`
- `crates/api/src/billing/deploy_sweep.rs`
- `crates/api/src/billing/display.rs`
- `crates/api/src/http/billing.rs`
- `crates/api/src/http/pricing.rs`

The code computed deploy resource usage as second-precision totals:

- memory: GB-seconds
- CPU: vCPU-seconds
- volume: GB-seconds

Before the fix, `deploy_sweep.rs` sent those raw second totals directly to Polar as the event metadata `value`.

Using `POLAR_UNSTATUS_KEY`, Polar's live catalog showed the deploy prices are hourly unit prices:

- `deploy_memory`: `1.389600000000` cents per unit
- `deploy_cpu`: `2.779200000000` cents per unit
- `deploy_volume`: `0.021600000000` cents per unit

Those values correspond to monthly display prices when multiplied by `720` hours/month:

- memory: about `$10.01 / GB-month`
- CPU: about `$20.01 / vCPU-month`
- volume: about `$0.16 / GB-month`

## Root cause

The live Polar price units were hourly, but the API was ingesting whole seconds as if each second were one full hourly unit.

That meant the deploy CPU meter, and the other deploy resource meters, could be billed roughly `3600x` too high for newly ingested usage because Polar interpreted each second as one billable hourly unit.

The intended model is Railway-style second-based billing: usage is measured from exact start/stop timestamps down to milliseconds, then converted to fractional hours before Polar ingest. For example, one second of `1 vCPU` usage becomes `1 / 3600` vCPU-hours in Polar, so the charge is proportional to one second, not rounded up to an hour.

## Code changes made

Changed `crates/api/src/billing/deploy_sweep.rs`:

- Keeps internal second-precision calculation.
- Converts `memory_seconds`, `cpu_seconds`, and `volume_seconds` to fractional hours before creating Polar events.
- Updated the unit tests to assert event metadata values are fractional hours, including a one-second usage case.

Changed `crates/api/src/billing/display.rs`:

- Replaced `SECONDS_PER_MONTH` with `HOURS_PER_MONTH`.
- Deploy resource price display now scales hourly cents by `720` hours/month.
- Updated display tests to use the live hourly-style unit prices.

Changed `crates/api/src/http/billing.rs`:

- Deploy meter balances from Polar are now treated as already being GB-hours / vCPU-hours.
- Removed the previous `/ 3_600.0` display conversion.

Changed `crates/api/src/http/pricing.rs`:

- Public pricing metadata now uses `HOURS_PER_MONTH` for deploy resource monthly display rates.

Changed comments/docs in:

- `crates/api/src/billing/deploy_usage.rs`
- `crates/api/src/config.rs`

## Validation run

Passed:

```sh
cargo test -p produktive-api overage_for_deploy_meters_is_per_unit_month
cargo test -p produktive-api build_events_metadata_value_is_fractional_hours_from_seconds
cargo test -p produktive-api build_events_preserves_one_second_usage_as_fractional_hours
just check
git diff --check
```

## Current git state after fix

Modified files:

- `crates/api/src/billing/deploy_sweep.rs`
- `crates/api/src/billing/deploy_usage.rs`
- `crates/api/src/billing/display.rs`
- `crates/api/src/config.rs`
- `crates/api/src/http/billing.rs`
- `crates/api/src/http/pricing.rs`

Diff stat at the time this context was written:

```text
6 files changed, 41 insertions(+), 38 deletions(-)
```

## Remaining operational note

This code fix only corrects future deploy usage ingestion.

Any deploy resource usage already ingested into Polar under the old seconds contract may still be present in the current invoice estimate. That requires a one-time Polar correction/reset for the affected deploy meters if the invoice should be fixed before finalization.
