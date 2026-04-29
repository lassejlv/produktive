use sea_orm::entity::prelude::*;
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "mcp_servers")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organization_id: String,
    pub created_by_id: Option<String>,
    pub name: String,
    pub slug: String,
    pub url: String,
    pub transport: Option<String>,
    pub enabled: bool,
    pub auth_type: String,
    pub auth_status: String,
    pub tool_cache: Option<Value>,
    pub last_checked_at: Option<DateTimeWithTimeZone>,
    pub last_error: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
