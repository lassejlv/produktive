use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "notes")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organization_id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub body_markdown: String,
    pub current_object_key: Option<String>,
    pub current_version_id: Option<String>,
    pub body_sha256: Option<String>,
    pub body_snippet: Option<String>,
    pub visibility: String,
    pub created_by_id: Option<String>,
    pub updated_by_id: Option<String>,
    pub archived_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
