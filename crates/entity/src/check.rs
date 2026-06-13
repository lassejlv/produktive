use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

// Hypertable backing model. Composite PK (time, monitor_id) — SeaORM requires a pk
// declaration so we mark `time` as such; inserts go through raw SQL anyway.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "checks")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub time: chrono::DateTime<chrono::FixedOffset>,
    #[sea_orm(primary_key, auto_increment = false)]
    pub monitor_id: Uuid,
    pub region_id: Option<Uuid>,
    pub status: i16,
    pub latency_ms: Option<i32>,
    pub status_code: Option<i32>,
    pub error_message: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
