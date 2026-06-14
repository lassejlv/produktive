use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Polar `metadata` objects: string keys to scalar values.
pub type Metadata = BTreeMap<String, Value>;

/// Standard Polar list envelope: `{ "items": [...], "pagination": {...} }`.
#[derive(Debug, Clone, Deserialize)]
pub struct ListResource<T> {
    pub items: Vec<T>,
    #[serde(default)]
    pub pagination: Option<Pagination>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub total_count: i64,
    pub max_page: i64,
}
