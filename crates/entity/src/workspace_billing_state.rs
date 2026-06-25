use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "workspace_billing_states")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub workspace_id: Uuid,
    pub polar_customer_id: String,
    pub polar_external_id: String,
    pub plan_id: String,
    pub polar_product_id: Option<String>,
    pub polar_subscription_id: Option<String>,
    pub subscription_status: Option<String>,
    pub cancel_at_period_end: bool,
    pub current_period_start: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub current_period_end: Option<chrono::DateTime<chrono::FixedOffset>>,
    #[sea_orm(column_type = "JsonBinary")]
    pub customer_state: Json,
    pub last_event_id: Option<String>,
    pub last_synced_at: chrono::DateTime<chrono::FixedOffset>,
    pub usage_reset_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub events_consumed_baseline: f64,
    pub events_baseline_period_end: Option<chrono::DateTime<chrono::FixedOffset>>,
    /// High-water mark for the deploy usage sweep (`workspace_billing_states`).
    /// NULL until the first successful deploy-usage ingest for this customer.
    pub deploy_usage_last_sent_at: Option<chrono::DateTime<chrono::FixedOffset>>,
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
}

impl Related<super::workspace::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Workspace.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
