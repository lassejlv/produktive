//! Shared human-facing formatting for the billing/pricing API responses.

/// Boolean perks, in display order (matches the public pricing layout).
pub const PERK_FEATURES: [&str; 6] = [
    "five_min_checks",
    "one_min_checks",
    "custom_domain",
    "multi_region",
    "priority_support",
    "remove_branding",
];

/// Short label for a perk (shown on plan cards).
pub fn perk_label(feature: &str) -> &'static str {
    match feature {
        "custom_domain" => "Custom domain",
        "one_min_checks" => "1 min checks",
        "five_min_checks" => "5 min checks",
        "multi_region" => "Multi region",
        "priority_support" => "Priority support",
        "remove_branding" => "Remove branding",
        _ => "Feature",
    }
}

/// Catalog display name for any feature (metered or perk).
pub fn feature_display_name(feature: &str) -> &'static str {
    match feature {
        "events" => "Events",
        "monitors" => "Monitors",
        "members" => "Members",
        other => perk_label(other),
    }
}

/// Singular/plural noun for a metered feature given a count.
pub fn feature_noun(feature: &str, count: f64) -> &'static str {
    let one = (count - 1.0).abs() < f64::EPSILON;
    match (feature, one) {
        ("events", _) => "events",
        ("monitors", true) => "monitor",
        ("monitors", false) => "monitors",
        ("members", true) => "member",
        ("members", false) => "members",
        _ => "units",
    }
}

/// Overage line, e.g. `then $0.5 per 1,000 events` / `then $0.5 per monitor`.
pub fn overage_text(feature: &str, cents_per_unit: f64) -> String {
    match feature {
        "events" => format!(
            "then ${} per 1,000 events",
            trim_decimal(cents_per_unit * 1000.0 / 100.0)
        ),
        "monitors" => format!("then ${} per monitor", trim_decimal(cents_per_unit / 100.0)),
        "members" => format!("then ${} per member", trim_decimal(cents_per_unit / 100.0)),
        _ => format!("then ${} per unit", trim_decimal(cents_per_unit / 100.0)),
    }
}

/// Group a whole number with thousands separators: `10000.0` → `10,000`.
pub fn format_thousands(value: f64) -> String {
    let n = value.round() as i64;
    let digits = n.abs().to_string();
    let mut out = String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

/// Format a dollar amount with up to two decimals, trailing zeros trimmed.
pub fn trim_decimal(value: f64) -> String {
    if value.fract().abs() < f64::EPSILON {
        format!("{}", value as i64)
    } else {
        format!("{value:.2}")
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thousands_grouping() {
        assert_eq!(format_thousands(10_000.0), "10,000");
        assert_eq!(format_thousands(1_000_000.0), "1,000,000");
        assert_eq!(format_thousands(3.0), "3");
    }

    #[test]
    fn overage_matches_legacy_pricing() {
        assert_eq!(overage_text("events", 0.05), "then $0.5 per 1,000 events");
        assert_eq!(overage_text("monitors", 50.0), "then $0.5 per monitor");
        assert_eq!(overage_text("members", 100.0), "then $1 per member");
    }

    #[test]
    fn nouns_singularize() {
        assert_eq!(feature_noun("monitors", 1.0), "monitor");
        assert_eq!(feature_noun("monitors", 3.0), "monitors");
    }
}
