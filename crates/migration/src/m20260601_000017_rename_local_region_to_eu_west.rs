use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::Statement;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();
        db.execute(Statement::from_string(
            backend,
            r#"
            DO $$
            DECLARE
                default_region_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
                local_region_id UUID;
                eu_west_region_id UUID;
            BEGIN
                SELECT id INTO local_region_id
                FROM regions
                WHERE id = default_region_id OR slug = 'local'
                ORDER BY CASE WHEN id = default_region_id THEN 0 ELSE 1 END
                LIMIT 1;

                SELECT id INTO eu_west_region_id
                FROM regions
                WHERE slug = 'eu-west'
                LIMIT 1;

                IF eu_west_region_id IS NULL THEN
                    IF local_region_id IS NULL THEN
                        INSERT INTO regions (id, slug, name, enabled, capabilities)
                        VALUES (
                            default_region_id,
                            'eu-west',
                            'eu-west',
                            TRUE,
                            '["http","tcp","ping","postgres","redis","ssh"]'::jsonb
                        )
                        ON CONFLICT (id) DO UPDATE
                        SET slug = EXCLUDED.slug,
                            name = EXCLUDED.name,
                            enabled = TRUE,
                            capabilities = EXCLUDED.capabilities,
                            updated_at = now();
                    ELSE
                        UPDATE regions
                        SET slug = 'eu-west',
                            name = 'eu-west',
                            enabled = TRUE,
                            updated_at = now()
                        WHERE id = local_region_id;
                    END IF;
                ELSE
                    UPDATE regions
                    SET name = 'eu-west',
                        enabled = TRUE,
                        updated_at = now()
                    WHERE id = eu_west_region_id;

                    IF local_region_id IS NOT NULL AND local_region_id <> eu_west_region_id THEN
                        UPDATE checks
                        SET region_id = eu_west_region_id
                        WHERE region_id = local_region_id;

                        INSERT INTO monitor_regions (monitor_id, region_id, enabled, created_at, updated_at)
                        SELECT monitor_id, eu_west_region_id, enabled, created_at, now()
                        FROM monitor_regions
                        WHERE region_id = local_region_id
                        ON CONFLICT (monitor_id, region_id) DO UPDATE
                        SET enabled = monitor_regions.enabled OR EXCLUDED.enabled,
                            updated_at = now();

                        INSERT INTO monitor_region_states (
                            monitor_id,
                            region_id,
                            last_status,
                            last_latency_ms,
                            last_checked_at,
                            last_error,
                            lease_id,
                            lease_expires_at,
                            updated_at
                        )
                        SELECT monitor_id,
                               eu_west_region_id,
                               last_status,
                               last_latency_ms,
                               last_checked_at,
                               last_error,
                               lease_id,
                               lease_expires_at,
                               now()
                        FROM monitor_region_states
                        WHERE region_id = local_region_id
                        ON CONFLICT (monitor_id, region_id) DO UPDATE
                        SET last_status = COALESCE(EXCLUDED.last_status, monitor_region_states.last_status),
                            last_latency_ms = COALESCE(EXCLUDED.last_latency_ms, monitor_region_states.last_latency_ms),
                            last_checked_at = COALESCE(EXCLUDED.last_checked_at, monitor_region_states.last_checked_at),
                            last_error = COALESCE(EXCLUDED.last_error, monitor_region_states.last_error),
                            lease_id = COALESCE(EXCLUDED.lease_id, monitor_region_states.lease_id),
                            lease_expires_at = COALESCE(EXCLUDED.lease_expires_at, monitor_region_states.lease_expires_at),
                            updated_at = now();

                        DELETE FROM monitor_region_states WHERE region_id = local_region_id;
                        DELETE FROM monitor_regions WHERE region_id = local_region_id;
                        DELETE FROM regions WHERE id = local_region_id;
                    END IF;
                END IF;
            END $$;
            "#,
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();
        db.execute(Statement::from_string(
            backend,
            r#"
            DO $$
            DECLARE
                default_region_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
                eu_west_region_id UUID;
            BEGIN
                SELECT id INTO eu_west_region_id
                FROM regions
                WHERE id = default_region_id OR slug = 'eu-west'
                ORDER BY CASE WHEN id = default_region_id THEN 0 ELSE 1 END
                LIMIT 1;

                IF eu_west_region_id IS NULL THEN
                    INSERT INTO regions (id, slug, name, enabled, capabilities)
                    VALUES (
                        default_region_id,
                        'local',
                        'Local',
                        TRUE,
                        '["http","tcp","ping","postgres","redis","ssh"]'::jsonb
                    )
                    ON CONFLICT (id) DO NOTHING;
                ELSE
                    UPDATE regions
                    SET slug = 'local',
                        name = 'Local',
                        enabled = TRUE,
                        updated_at = now()
                    WHERE id = eu_west_region_id
                      AND NOT EXISTS (
                          SELECT 1 FROM regions WHERE slug = 'local' AND id <> eu_west_region_id
                      );
                END IF;
            END $$;
            "#,
        ))
        .await?;

        Ok(())
    }
}
