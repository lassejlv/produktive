use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{DeployError, DeployResult};

/// Fly region codes enabled for Produktive deployments (order preserved for UI).
pub const ALLOWED_REGION_CODES: &[&str] = &["ams", "arn", "sin", "iad", "sjc"];

pub const DEFAULT_DEPLOY_REGION: &str = "ams";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct DeployRegion {
    pub code: String,
    pub name: String,
    pub flag: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FlyPlatformRegion {
    pub code: String,
    pub name: String,
}

/// Validates format and allowlist membership.
pub fn validate_allowed_region(region: &str) -> DeployResult<()> {
    super::model::validate_region(region)?;
    let region = region.trim();
    if !ALLOWED_REGION_CODES.contains(&region) {
        return Err(DeployError::Validation(format!(
            "region '{region}' is not enabled for deployments"
        )));
    }
    Ok(())
}

/// Map a Produktive (Fly-style) region code to the nearest Google Cloud Run
/// region. The product exposes one region vocabulary across providers, so the
/// Cloud Run adapter translates the selected code to a GCP location at deploy
/// time. Falls back to `europe-west1` for any unmapped code.
pub fn cloud_run_region(code: &str) -> &'static str {
    match code.trim() {
        "ams" => "europe-west4",            // Amsterdam, Netherlands
        "arn" => "europe-north1",           // Stockholm → Finland
        "sin" => "asia-southeast1",         // Singapore
        "iad" => "us-east4",                // Ashburn, N. Virginia
        "sjc" => "us-west1",                // San Jose → Oregon (nearest GCP)
        "fra" => "europe-west3",            // Frankfurt
        "cdg" => "europe-west9",            // Paris
        "lhr" => "europe-west2",            // London
        "ord" => "us-central1",             // Chicago → Iowa
        "yyz" => "northamerica-northeast2", // Toronto
        "nrt" => "asia-northeast1",         // Tokyo
        "syd" => "australia-southeast1",    // Sydney
        _ => "europe-west1",
    }
}

pub fn region_flag(code: &str) -> &'static str {
    match code {
        "ams" => "🇳🇱",
        "arn" => "🇸🇪",
        "fra" => "🇩🇪",
        "cdg" => "🇫🇷",
        "lhr" => "🇬🇧",
        "sjc" => "🇺🇸",
        "iad" => "🇺🇸",
        "ord" => "🇺🇸",
        "dfw" => "🇺🇸",
        "lax" => "🇺🇸",
        "yyz" => "🇨🇦",
        "sin" => "🇸🇬",
        "nrt" => "🇯🇵",
        "syd" => "🇦🇺",
        _ => "🌍",
    }
}

fn static_region_name(code: &str) -> String {
    match code {
        "ams" => "Amsterdam, Netherlands".into(),
        "arn" => "Stockholm, Sweden".into(),
        "fra" => "Frankfurt, Germany".into(),
        "cdg" => "Paris, France".into(),
        "lhr" => "London, United Kingdom".into(),
        "sjc" => "San Jose, California (US)".into(),
        "iad" => "Ashburn, Virginia (US)".into(),
        "ord" => "Chicago, Illinois (US)".into(),
        "dfw" => "Dallas, Texas (US)".into(),
        "lax" => "Los Angeles, California (US)".into(),
        "yyz" => "Toronto, Canada".into(),
        "sin" => "Singapore".into(),
        "nrt" => "Tokyo, Japan".into(),
        "syd" => "Sydney, Australia".into(),
        _ => code.to_owned(),
    }
}

pub fn static_allowed_regions() -> Vec<DeployRegion> {
    ALLOWED_REGION_CODES
        .iter()
        .map(|code| DeployRegion {
            code: (*code).into(),
            name: static_region_name(code),
            flag: region_flag(code).into(),
        })
        .collect()
}

/// Merge Fly platform metadata with the Produktive allowlist.
pub fn catalog_from_fly(fly_regions: &[FlyPlatformRegion]) -> Vec<DeployRegion> {
    let fly_by_code = fly_regions
        .iter()
        .map(|region| (region.code.as_str(), region))
        .collect::<std::collections::BTreeMap<_, _>>();

    ALLOWED_REGION_CODES
        .iter()
        .map(|code| {
            let name = fly_by_code
                .get(code)
                .map(|region| region.name.trim().to_owned())
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| static_region_name(code));
            DeployRegion {
                code: (*code).into(),
                name,
                flag: region_flag(code).into(),
            }
        })
        .collect()
}

pub fn lookup_region_label(code: &str, catalog: &[DeployRegion]) -> Option<DeployRegion> {
    catalog
        .iter()
        .find(|region| region.code == code)
        .cloned()
        .or_else(|| {
            if ALLOWED_REGION_CODES.contains(&code) {
                Some(DeployRegion {
                    code: code.into(),
                    name: static_region_name(code),
                    flag: region_flag(code).into(),
                })
            } else {
                None
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_region() {
        assert!(validate_allowed_region("gru").is_err());
        assert!(validate_allowed_region("iad").is_ok());
        assert!(validate_allowed_region("sin").is_ok());
        assert!(validate_allowed_region("fra").is_err());
        assert!(validate_allowed_region("ams").is_ok());
    }

    #[test]
    fn maps_allowed_regions_to_gcp() {
        // Every enabled region must resolve to a real GCP location (not the fallback
        // by accident) for the listed codes.
        assert_eq!(cloud_run_region("ams"), "europe-west4");
        assert_eq!(cloud_run_region("arn"), "europe-north1");
        assert_eq!(cloud_run_region("sin"), "asia-southeast1");
        assert_eq!(cloud_run_region("iad"), "us-east4");
        assert_eq!(cloud_run_region("sjc"), "us-west1");
        // Unknown codes fall back rather than panicking.
        assert_eq!(cloud_run_region("zzz"), "europe-west1");
    }

    #[test]
    fn merges_fly_names() {
        let catalog = catalog_from_fly(&[
            FlyPlatformRegion {
                code: "ams".into(),
                name: "Amsterdam, Netherlands".into(),
            },
            FlyPlatformRegion {
                code: "sjc".into(),
                name: "San Jose, California (US)".into(),
            },
        ]);
        assert_eq!(catalog.len(), 5);
        assert_eq!(catalog[0].code, "ams");
        assert_eq!(catalog[0].name, "Amsterdam, Netherlands");
        assert_eq!(catalog[4].code, "sjc");
        assert_eq!(catalog[4].name, "San Jose, California (US)");
    }
}
