use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .add_column_if_not_exists(
                        ColumnDef::new(Users::OnboardingCompletedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .add_column_if_not_exists(ColumnDef::new(Users::OnboardingStep).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::OnboardingCompletedAt)
                    .drop_column(Users::OnboardingStep)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    OnboardingCompletedAt,
    OnboardingStep,
}
