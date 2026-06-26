use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Tigris single-region codes exposed in the Produktive UI.
pub const ALLOWED_REGION_CODES: &[&str] = &["ams", "fra", "iad", "lhr", "ord", "sin", "sjc"];

pub const DEFAULT_OBJECT_STORAGE_REGION: &str = "ams";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct DeployRegion {
    pub code: String,
    pub name: String,
    pub flag: String,
}

pub fn validate_allowed_region(region: &str) -> Result<(), String> {
    let region = region.trim().to_lowercase();
    if region.is_empty() {
        return Err("region is required".into());
    }
    if !ALLOWED_REGION_CODES.contains(&region.as_str()) {
        return Err(format!(
            "region '{region}' is not enabled for object storage"
        ));
    }
    Ok(())
}

pub fn region_flag(code: &str) -> &'static str {
    match code {
        "ams" => "🇳🇱",
        "fra" => "🇩🇪",
        "iad" => "🇺🇸",
        "lhr" => "🇬🇧",
        "ord" => "🇺🇸",
        "sin" => "🇸🇬",
        "sjc" => "🇺🇸",
        _ => "🌍",
    }
}

fn static_region_name(code: &str) -> String {
    match code {
        "ams" => "Amsterdam, Netherlands".into(),
        "fra" => "Frankfurt, Germany".into(),
        "iad" => "Ashburn, Virginia (US)".into(),
        "lhr" => "London, United Kingdom".into(),
        "ord" => "Chicago, Illinois (US)".into(),
        "sin" => "Singapore".into(),
        "sjc" => "San Jose, California (US)".into(),
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

pub fn lookup_region_label(code: &str) -> Option<DeployRegion> {
    if ALLOWED_REGION_CODES.contains(&code) {
        Some(DeployRegion {
            code: code.into(),
            name: static_region_name(code),
            flag: region_flag(code).into(),
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_region() {
        assert!(validate_allowed_region("tokyo").is_err());
        assert!(validate_allowed_region("ams").is_ok());
    }
}
