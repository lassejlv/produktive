use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "log_projects")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub bucket_id: Option<Uuid>,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub retention_days: i32,
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
        belongs_to = "super::log_storage_bucket::Entity",
        from = "Column::BucketId",
        to = "super::log_storage_bucket::Column::Id",
        on_delete = "SetNull"
    )]
    Bucket,
    #[sea_orm(has_many = "super::log_ingest_token::Entity")]
    IngestTokens,
    #[sea_orm(has_many = "super::log_alert_rule::Entity")]
    AlertRules,
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl Related<super::log_storage_bucket::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Bucket.def()
    }
}

impl Related<super::log_ingest_token::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::IngestTokens.def()
    }
}

impl Related<super::log_alert_rule::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AlertRules.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
