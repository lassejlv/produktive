use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "polar_webhook_events")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub webhook_id: String,
    pub polar_event_id: Option<String>,
    pub event_type: String,
    pub workspace_id: Option<Uuid>,
    pub polar_customer_id: Option<String>,
    pub polar_external_id: Option<String>,
    pub polar_subscription_id: Option<String>,
    #[sea_orm(column_type = "JsonBinary")]
    pub payload: Json,
    pub status: i16,
    pub error_message: Option<String>,
    pub received_at: chrono::DateTime<chrono::FixedOffset>,
    pub processed_at: Option<chrono::DateTime<chrono::FixedOffset>>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::workspace::Entity",
        from = "Column::WorkspaceId",
        to = "super::workspace::Column::Id",
        on_delete = "SetNull"
    )]
    Workspace,
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
