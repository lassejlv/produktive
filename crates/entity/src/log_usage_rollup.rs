use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "log_usage_rollups")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub workspace_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub project_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub bucket_start: chrono::DateTime<chrono::FixedOffset>,
    pub event_count: i64,
    pub bytes_ingested: i64,
    pub last_ingested_at: Option<chrono::DateTime<chrono::FixedOffset>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
