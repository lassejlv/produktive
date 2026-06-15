use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "log_storage_buckets")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub name: String,
    pub storage_uri: String,
    pub region: Option<String>,
    pub endpoint: Option<String>,
    pub access_key_id: Option<String>,
    #[serde(skip_serializing)]
    pub secret_access_key: Option<String>,
    pub enabled: bool,
    pub max_projects: i32,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub updated_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::log_project::Entity")]
    Projects,
}

impl Related<super::log_project::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Projects.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
