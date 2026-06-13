use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "monitor_region_states")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub monitor_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub region_id: Uuid,
    pub last_status: Option<i16>,
    pub last_latency_ms: Option<i32>,
    pub last_checked_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub last_error: Option<String>,
    pub lease_id: Option<Uuid>,
    pub lease_expires_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub updated_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::monitor::Entity",
        from = "Column::MonitorId",
        to = "super::monitor::Column::Id",
        on_delete = "Cascade"
    )]
    Monitor,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id",
        on_delete = "Cascade"
    )]
    Region,
}

impl Related<super::monitor::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Monitor.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
