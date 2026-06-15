use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "log_alert_firings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub rule_id: Uuid,
    pub matched_count: i64,
    pub window_start: chrono::DateTime<chrono::FixedOffset>,
    pub window_end: chrono::DateTime<chrono::FixedOffset>,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub sample: Option<Json>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
