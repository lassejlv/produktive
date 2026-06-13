use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, ToSchema,
)]
#[sea_orm(rs_type = "i16", db_type = "SmallInteger")]
#[serde(rename_all = "lowercase")]
pub enum MonitorKind {
    #[sea_orm(num_value = 0)]
    Http,
    #[sea_orm(num_value = 1)]
    Tcp,
    #[sea_orm(num_value = 2)]
    Ping,
    #[sea_orm(num_value = 3)]
    Postgres,
    #[sea_orm(num_value = 4)]
    Redis,
    #[sea_orm(num_value = 5)]
    Ssh,
}

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "monitors")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub slug: String,
    pub name: String,
    pub kind: MonitorKind,
    pub target: String,
    pub interval_seconds: i32,
    pub timeout_ms: i32,
    pub expected_status: Option<i32>,
    pub expected_body_contains: Option<String>,
    pub enabled: bool,
    pub last_status: Option<i16>,
    pub last_latency_ms: Option<i32>,
    pub last_checked_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub canvas_x: i32,
    pub canvas_y: i32,
    pub dsl_source: Option<String>,
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
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
