use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "support_messages")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub ticket_id: String,
    pub direction: String,
    pub from_email: String,
    pub to_email: String,
    pub cc: Json,
    pub subject: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub raw_object_key: Option<String>,
    pub sent_by_admin_id: Option<String>,
    pub delivery_status: String,
    pub delivery_provider_id: Option<String>,
    pub delivery_error: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
