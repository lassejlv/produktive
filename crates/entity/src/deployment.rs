use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "deployments")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub image: String,
    pub image_digest: Option<String>,
    pub status: i16,
    pub requested_by: Option<Uuid>,
    pub provider: String,
    pub provider_deployment_id: Option<String>,
    pub provider_instance_id: Option<String>,
    pub provider_metadata: Json,
    pub failure_message: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub finished_at: Option<chrono::DateTime<chrono::FixedOffset>>,
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
        belongs_to = "super::deploy_service::Entity",
        from = "Column::ServiceId",
        to = "super::deploy_service::Column::Id",
        on_delete = "Cascade"
    )]
    Service,
    #[sea_orm(has_many = "super::deploy_instance::Entity")]
    Instances,
    #[sea_orm(has_many = "super::deploy_event::Entity")]
    Events,
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl Related<super::deploy_service::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Service.def()
    }
}

impl Related<super::deploy_instance::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Instances.def()
    }
}

impl Related<super::deploy_event::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Events.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
