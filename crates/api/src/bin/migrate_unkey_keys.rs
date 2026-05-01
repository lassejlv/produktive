use anyhow::{anyhow, Context};
use chrono::Utc;
use produktive_entity::mcp_api_key;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, Database, EntityTrait, IntoActiveModel,
    PaginatorTrait, QueryFilter, Set,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use unkey_rs::{
    models::{Metadata, MigrateKey, MigrateKeyHash, MigrateKeyHashVariant, MigrateKeysRequest},
    Unkey, UnkeyConfig,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "migrate_unkey_keys=info".into()),
        )
        .init();

    let database_url = optional_env("DATABASE_DIRECT_URL")
        .or_else(|| optional_env("DATABASE_URL"))
        .ok_or_else(|| anyhow!("DATABASE_URL is required"))?;
    let unkey_root_key = required_env("UNKEY_ROOT_KEY")?;
    let unkey_api_id = required_env("UNKEY_API_ID")?;
    let migration_id = required_env("UNKEY_MIGRATION_ID")?;

    let mut unkey_config = UnkeyConfig::new(unkey_root_key);
    if let Some(base_url) = optional_env("UNKEY_BASE_URL") {
        unkey_config = unkey_config.base_url(base_url);
    }
    let unkey = Unkey::with_config(unkey_config).context("failed to build Unkey client")?;
    let db = Database::connect(&database_url)
        .await
        .context("failed to connect to database")?;

    let now = Utc::now().fixed_offset();
    let rows = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::UnkeyKeyId.is_null())
        .filter(mcp_api_key::Column::RevokedAt.is_null())
        .filter(
            Condition::any()
                .add(mcp_api_key::Column::ExpiresAt.is_null())
                .add(mcp_api_key::Column::ExpiresAt.gt(now)),
        )
        .all(&db)
        .await
        .context("failed to load legacy API keys")?;

    if rows.is_empty() {
        println!("imported=0 skipped=0 failed=0");
        return Ok(());
    }

    let skipped = mcp_api_key::Entity::find()
        .filter(mcp_api_key::Column::UnkeyKeyId.is_not_null())
        .count(&db)
        .await
        .context("failed to count already migrated API keys")?;

    let request = MigrateKeysRequest {
        migration_id,
        api_id: unkey_api_id,
        keys: rows.iter().map(migrate_key_request).collect(),
    };

    let result = unkey
        .keys()
        .migrate_keys(request)
        .await
        .context("Unkey keys.migrateKeys failed")?
        .data;

    for failure in &result.failed {
        eprintln!("failed hash={} error={}", failure.hash, failure.error);
    }

    let migrated_by_hash = result
        .migrated
        .into_iter()
        .map(|item| (item.hash, item.key_id))
        .collect::<HashMap<_, _>>();

    let mut imported = 0_u64;
    let mut failed = result.failed.len() as u64;
    let sync_time = Utc::now().fixed_offset();

    for row in rows {
        let Some(unkey_key_id) = migrated_by_hash.get(&row.token_hash) else {
            failed += 1;
            eprintln!(
                "failed hash={} error=missing migration result",
                row.token_hash
            );
            continue;
        };

        let mut active = row.into_active_model();
        active.unkey_key_id = Set(Some(unkey_key_id.clone()));
        active.unkey_migrated_at = Set(Some(sync_time));
        active.unkey_synced_at = Set(Some(sync_time));
        active.updated_at = Set(sync_time);
        active
            .update(&db)
            .await
            .with_context(|| format!("failed to write Unkey key id {unkey_key_id}"))?;
        imported += 1;
    }

    println!("imported={imported} skipped={skipped} failed={failed}");
    if failed > 0 {
        anyhow::bail!("Unkey migration had {failed} failed key(s)");
    }

    Ok(())
}

fn migrate_key_request(row: &mcp_api_key::Model) -> MigrateKey {
    MigrateKey {
        hash: MigrateKeyHash {
            value: row.token_hash.clone(),
            variant: MigrateKeyHashVariant::Sha256Hex,
        },
        prefix: Some(key_prefix(&row.token_prefix).to_owned()),
        name: Some(row.name.clone()),
        external_id: Some(row.user_id.clone()),
        meta: key_metadata(row),
        expires: row.expires_at.map(|value| value.timestamp_millis()),
        enabled: Some(true),
        ..Default::default()
    }
}

fn key_metadata(row: &mcp_api_key::Model) -> Metadata {
    let mut meta: HashMap<String, Value> = HashMap::new();
    meta.insert("local_key_id".to_owned(), json!(row.id));
    meta.insert("user_id".to_owned(), json!(row.user_id));
    meta.insert(
        "token_kind".to_owned(),
        json!(token_kind(&row.token_prefix)),
    );
    if let Some(organization_id) = row.active_organization_id.as_deref() {
        meta.insert("organization_id".to_owned(), json!(organization_id));
    }
    meta
}

fn key_prefix(display_prefix: &str) -> &str {
    if display_prefix.starts_with("pk_mcp") {
        "pk_mcp"
    } else if display_prefix.starts_with("pk_api") {
        "pk_api"
    } else {
        display_prefix
    }
}

fn token_kind(display_prefix: &str) -> &str {
    if display_prefix.starts_with("pk_mcp") {
        "mcp"
    } else {
        "api"
    }
}

fn required_env(key: &str) -> anyhow::Result<String> {
    optional_env(key).ok_or_else(|| anyhow!("{key} is required"))
}

fn optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
