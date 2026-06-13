use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "workspaces")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub is_personal: bool,
    pub owner_id: Uuid,
    pub status_slug: Option<String>,
    pub status_page_enabled: bool,
    pub status_page_title: Option<String>,
    pub status_page_description: Option<String>,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    #[schema(value_type = Option<Object>)]
    pub status_page_config: Option<Json>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub updated_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::OwnerId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    Owner,
    #[sea_orm(has_many = "super::workspace_member::Entity")]
    Members,
    #[sea_orm(has_many = "super::monitor::Entity")]
    Monitors,
    #[sea_orm(has_many = "super::workspace_invite::Entity")]
    Invites,
}

impl Related<super::workspace_member::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Members.def()
    }
}

impl Related<super::monitor::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Monitors.def()
    }
}

impl Related<super::workspace_invite::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Invites.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
