use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) db: DatabaseConnection,
    pub(crate) issuer_url: String,
    pub(crate) resource_url: String,
}
