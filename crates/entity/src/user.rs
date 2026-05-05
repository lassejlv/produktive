use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub password_hash: String,
    pub image: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    pub onboarding_completed_at: Option<DateTimeWithTimeZone>,
    pub onboarding_step: Option<String>,
    pub suspended_at: Option<DateTimeWithTimeZone>,
    pub suspended_by_id: Option<String>,
    pub suspension_reason: Option<String>,
    pub suspension_note: Option<String>,
    pub two_factor_enabled: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
