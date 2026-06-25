use sea_orm::entity::prelude::*;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "custom_domains")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub hostname: String,
    pub verification_name: String,
    pub verification_value: String,
    pub verified_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    /// Cloudflare for SaaS Custom Hostname id (used to poll/delete the hostname).
    pub cf_hostname_id: Option<String>,
    /// Last-seen Cloudflare `ssl.status` (e.g. `pending_validation`, `active`).
    pub ssl_status: Option<String>,
    /// When the reconcile sweep last synced state from Cloudflare.
    pub cf_synced_at: Option<chrono::DateTime<chrono::FixedOffset>>,
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
