use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, ToSchema,
)]
#[sea_orm(rs_type = "i16", db_type = "SmallInteger")]
#[serde(rename_all = "lowercase")]
pub enum IncidentStatus {
    #[sea_orm(num_value = 0)]
    Open,
    #[sea_orm(num_value = 1)]
    Resolved,
}

#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, ToSchema,
)]
#[sea_orm(rs_type = "i16", db_type = "SmallInteger")]
#[serde(rename_all = "lowercase")]
pub enum IncidentSeverity {
    #[sea_orm(num_value = 0)]
    Down,
    #[sea_orm(num_value = 2)]
    Degraded,
    #[sea_orm(num_value = 3)]
    Maintenance,
    #[sea_orm(num_value = 4)]
    Informational,
    #[sea_orm(num_value = 5)]
    Minor,
    #[sea_orm(num_value = 6)]
    Critical,
}

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "incidents")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub monitor_id: Option<Uuid>,
    pub title: String,
    pub source: i16,
    pub status: IncidentStatus,
    pub severity: IncidentSeverity,
    pub started_at: chrono::DateTime<chrono::FixedOffset>,
    pub last_seen_at: chrono::DateTime<chrono::FixedOffset>,
    pub resolved_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub error_message: Option<String>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub updated_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::workspace::Entity",
        from = "Column::WorkspaceId",
        to = "super::workspace::Column::Id",
        on_delete = "Cascade"
    )]
    Workspace,
    #[sea_orm(
        belongs_to = "super::monitor::Entity",
        from = "Column::MonitorId",
        to = "super::monitor::Column::Id",
        on_delete = "Cascade"
    )]
    Monitor,
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl Related<super::monitor::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Monitor.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
