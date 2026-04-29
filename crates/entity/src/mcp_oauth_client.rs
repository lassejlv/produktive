use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(table_name = "mcp_oauth_clients")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub server_id: String,
    pub organization_id: String,
    pub client_id: String,
    pub client_secret_ciphertext: Option<String>,
    pub token_endpoint_auth_method: String,
    pub registration_access_token_ciphertext: Option<String>,
    pub registration_client_uri: Option<String>,
    pub client_id_issued_at: Option<DateTimeWithTimeZone>,
    pub client_secret_expires_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
