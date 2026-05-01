use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "organization_subscriptions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organization_id: String,
    pub product_id: String,
    pub status: String,
    pub current_period_start: Option<DateTimeWithTimeZone>,
    pub current_period_end: Option<DateTimeWithTimeZone>,
    pub cancel_at_period_end: bool,
    pub canceled_at: Option<DateTimeWithTimeZone>,
    pub ends_at: Option<DateTimeWithTimeZone>,
    pub customer_id: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
