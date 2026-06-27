use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "deploy_services")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub registry_credential_id: Option<Uuid>,
    pub provider: String,
    pub provider_service_id: Option<String>,
    pub log_project_id: Option<Uuid>,
    pub provider_metadata: Json,
    pub slug: String,
    pub name: String,
    pub image: String,
    pub registry_kind: String,
    pub source_kind: String,
    pub repo_url: Option<String>,
    pub git_ref: Option<String>,
    pub dockerfile_path: Option<String>,
    pub root_dir: Option<String>,
    pub internal_port: i32,
    pub env: Json,
    pub environment: String,
    pub health_check_path: String,
    pub region: String,
    pub resource_preset: String,
    pub machine_count: i32,
    pub url: Option<String>,
    pub status: i16,
    pub canvas_x: i32,
    pub canvas_y: i32,
    pub disabled_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub created_by: Option<Uuid>,
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
        belongs_to = "super::deploy_registry_credential::Entity",
        from = "Column::RegistryCredentialId",
        to = "super::deploy_registry_credential::Column::Id",
        on_delete = "SetNull"
    )]
    RegistryCredential,
    #[sea_orm(has_many = "super::deploy_service_secret::Entity")]
    Secrets,
    #[sea_orm(has_many = "super::deployment::Entity")]
    Deployments,
    #[sea_orm(has_many = "super::deploy_event::Entity")]
    Events,
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl Related<super::deploy_registry_credential::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RegistryCredential.def()
    }
}

impl Related<super::deploy_service_secret::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Secrets.def()
    }
}

impl Related<super::deployment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Deployments.def()
    }
}

impl Related<super::deploy_event::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Events.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
