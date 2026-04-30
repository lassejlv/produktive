use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "github_repositories")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organization_id: String,
    pub owner: String,
    pub repo: String,
    pub auto_import_enabled: bool,
    pub import_interval_minutes: i32,
    pub last_imported_at: Option<DateTimeWithTimeZone>,
    pub next_import_at: Option<DateTimeWithTimeZone>,
    pub last_import_status: Option<String>,
    pub last_import_error: Option<String>,
    pub last_imported_count: i32,
    pub last_updated_count: i32,
    pub last_skipped_count: i32,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
