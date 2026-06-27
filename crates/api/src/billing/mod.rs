pub mod catalog;
pub mod deploy_sweep;
pub mod deploy_usage;
pub mod display;
pub mod snapshot;
pub mod sweep;
pub mod usage;
pub mod webhooks;

pub use catalog::*;
pub use display::*;
pub use snapshot::*;
pub use usage::*;
pub use webhooks::*;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use polar::{CustomerState, Polar, PolarError};
use uuid::Uuid;

/// How long a fetched customer state is reused before refetching. Keeps the
/// per-check scheduler hot path from hitting Polar on every probe result.
const STATE_TTL: Duration = Duration::from_secs(60);

/// The billing integration handle stored in [`AppState`]: the Polar client, the
/// startup-loaded catalog, and a short-TTL cache of customer state.
#[derive(Clone)]
pub struct Billing {
    pub client: Polar,
    pub catalog: Arc<PolarCatalog>,
    cache: Arc<Mutex<HashMap<Uuid, CachedState>>>,
}

struct CachedState {
    state: Arc<CustomerState>,
    fetched_at: Instant,
}

impl Billing {
    /// Build the integration: construct the client and load the catalog from
    /// Polar. Returns `Ok(None)` when the catalog is empty (nothing tagged with
    /// tier metadata) so billing simply stays disabled.
    pub async fn load(client: Polar) -> Result<Option<Self>, PolarError> {
        let products = client.catalog().list_products().await?;
        let meters = client.catalog().list_meters().await?;
        let catalog = PolarCatalog::from_products_with_meters(products, meters);
        if catalog.is_empty() {
            tracing::warn!("Polar catalog is empty; billing features disabled");
            return Ok(None);
        }
        Ok(Some(Self {
            client,
            catalog: Arc::new(catalog),
            cache: Arc::new(Mutex::new(HashMap::new())),
        }))
    }

    /// Fetch fresh customer state and update the cache.
    pub async fn refresh_state(
        &self,
        workspace_id: Uuid,
    ) -> Result<Arc<CustomerState>, PolarError> {
        let state = self
            .client
            .customers()
            .state_by_external(&workspace_id.to_string())
            .await?;
        Ok(self.cache_state(workspace_id, state))
    }

    pub fn cache_state(&self, workspace_id: Uuid, state: CustomerState) -> Arc<CustomerState> {
        let state = Arc::new(state);
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(
                workspace_id,
                CachedState {
                    state: state.clone(),
                    fetched_at: Instant::now(),
                },
            );
        }
        state
    }

    pub fn cached_state(&self, workspace_id: Uuid) -> Option<Arc<CustomerState>> {
        self.cached(workspace_id)
    }

    /// Drop any cached state for a workspace (call after a subscription change).
    pub fn invalidate(&self, workspace_id: Uuid) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.remove(&workspace_id);
        }
    }

    fn cached(&self, workspace_id: Uuid) -> Option<Arc<CustomerState>> {
        let cache = self.cache.lock().ok()?;
        let entry = cache.get(&workspace_id)?;
        (entry.fetched_at.elapsed() < STATE_TTL).then(|| entry.state.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live integration check of the startup catalog load against the real Polar
    /// org. Ignored by default; run with:
    ///   POLAR_UNSTATUS_KEY=$POLAR_PRODUKTIVE_KEY cargo test -p produktive-api -- --ignored live_catalog
    #[tokio::test]
    #[ignore]
    async fn live_catalog_loads_expected_tiers() {
        let key = std::env::var("POLAR_UNSTATUS_KEY")
            .or_else(|_| std::env::var("POLAR_SECRET_KEY"))
            .expect("POLAR_UNSTATUS_KEY or POLAR_SECRET_KEY");
        let client = polar::Polar::new(key).unwrap();
        let billing = Billing::load(client)
            .await
            .unwrap()
            .expect("catalog should be non-empty");
        let catalog = &billing.catalog;

        // free: hard limits, no overage
        let free_monitors = catalog.entitlement("free", "monitors").unwrap();
        assert_eq!(free_monitors.included, 3.0);
        assert!(!free_monitors.overage_allowed);
        assert_eq!(
            catalog.entitlement("free", "events").unwrap().included,
            10_000.0
        );

        // basic/pro: overage on metered features
        let basic_monitors = catalog.entitlement("basic", "monitors").unwrap();
        assert_eq!(basic_monitors.included, 25.0);
        assert!(basic_monitors.overage_allowed);
        assert_eq!(basic_monitors.unit_amount_cents, Some(50.0));
        assert_eq!(
            catalog.entitlement("pro", "events").unwrap().included,
            1_000_000.0
        );

        // perks resolve by tier
        assert!(catalog.tier_has_perk("basic", "custom_domain"));
        assert!(catalog.tier_has_perk("pro", "multi_region"));
        assert!(!catalog.tier_has_perk("free", "custom_domain"));

        // meter ids + free product resolved
        assert!(catalog.meter_id("events").is_some());
        assert!(catalog.free_product_id().is_some());
    }
}
