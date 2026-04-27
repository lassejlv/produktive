#[tokio::main]
async fn main() {
    sea_orm_migration::cli::run_cli(produktive_migration::Migrator).await;
}
