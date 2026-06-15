use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "log_ingest_tokens")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    #[serde(skip_serializing)]
    pub token_hash: String,
    pub token_prefix: String,
    pub last_used_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub expires_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub revoked_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
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
        belongs_to = "super::log_project::Entity",
        from = "Column::ProjectId",
        to = "super::log_project::Column::Id",
        on_delete = "Cascade"
    )]
    Project,
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl Related<super::log_project::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Project.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
