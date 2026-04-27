#[tokio::main]
async fn main() {
    if let Ok(database_direct_url) = std::env::var("DATABASE_DIRECT_URL") {
        if !database_direct_url.trim().is_empty() {
            std::env::set_var("DATABASE_URL", database_direct_url);
        }
    }

    sea_orm_migration::cli::run_cli(produktive_migration::Migrator).await;
}
