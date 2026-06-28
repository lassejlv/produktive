use chrono::{DateTime, FixedOffset, Utc};
use deploy::{provider_app_name, SecretCipher};
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use tigris::{BucketAccess, TigrisClient, DEFAULT_OBJECT_STORAGE_REGION};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    slug,
    state::AppState,
};

const ACCESS_APPROVED: i16 = 1;

#[derive(Clone, Debug)]
pub struct CreateObjectStorageBucketInput {
    pub name: String,
    pub slug: Option<String>,
    pub region: Option<String>,
    pub access: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, utoipa::ToSchema)]
pub struct ObjectStorageBucketView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub slug: String,
    pub name: String,
    pub provider: String,
    pub provider_bucket_name: String,
    pub region: String,
    pub access: String,
    pub endpoint: String,
    pub access_key_id: Option<String>,
    pub secret_configured: bool,
    pub status: String,
    pub failure_message: Option<String>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Clone, Debug, serde::Serialize, utoipa::ToSchema)]
pub struct CreatedObjectStorageBucketView {
    #[serde(flatten)]
    pub bucket: ObjectStorageBucketView,
    /// Returned once at creation; not stored in plaintext after this response.
    pub secret_access_key: String,
}

#[derive(FromQueryResult)]
struct BucketRow {
    id: Uuid,
    workspace_id: Uuid,
    slug: String,
    name: String,
    provider: String,
    provider_bucket_name: String,
    region: String,
    access: String,
    endpoint: String,
    access_key_id: Option<String>,
    encrypted_secret: Option<String>,
    status: String,
    failure_message: Option<String>,
    created_at: DateTime<FixedOffset>,
    updated_at: DateTime<FixedOffset>,
}

pub async fn ensure_object_storage_access(state: &AppState, workspace_id: Uuid) -> ApiResult<()> {
    ensure_object_storage_enabled(state)?;
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT status FROM deploy_access_requests WHERE workspace_id = $1",
            [workspace_id.into()],
        ))
        .await?;
    match row.and_then(|row| row.try_get::<i16>("", "status").ok()) {
        Some(ACCESS_APPROVED) => Ok(()),
        _ => Err(ApiError::Forbidden),
    }
}

pub fn list_regions() -> Vec<tigris::DeployRegion> {
    tigris::static_allowed_regions()
}

pub async fn list_buckets(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Vec<ObjectStorageBucketView>> {
    ensure_object_storage_access(state, workspace_id).await?;
    bucket_rows(state, workspace_id, None).await
}

pub async fn get_bucket(
    state: &AppState,
    workspace_id: Uuid,
    bucket_id: Uuid,
) -> ApiResult<ObjectStorageBucketView> {
    ensure_object_storage_access(state, workspace_id).await?;
    load_bucket(state, workspace_id, bucket_id).await
}

pub async fn create_bucket(
    state: &AppState,
    workspace_id: Uuid,
    created_by: Option<Uuid>,
    body: CreateObjectStorageBucketInput,
) -> ApiResult<CreatedObjectStorageBucketView> {
    ensure_object_storage_access(state, workspace_id).await?;
    let tigris = tigris_client(state)?;
    let cipher = storage_cipher(state)?;

    let count = workspace_bucket_count(state, workspace_id).await?;
    if count >= state.config.object_storage_max_buckets_per_workspace {
        return Err(ApiError::payment_required(
            "object storage bucket limit reached",
        ));
    }

    let name = clean_text(body.name, 1, 120, "name")?;
    let slug = if let Some(slug) = body.slug {
        let slug = slug.trim().to_lowercase();
        validate_slug_like(&slug, "slug")?;
        if slug_exists(state, workspace_id, &slug).await? {
            return Err(ApiError::conflict("slug already in use"));
        }
        slug
    } else {
        slug::unique_object_storage_bucket_slug(&state.db, workspace_id, &name).await?
    };

    let region = body
        .region
        .unwrap_or_else(|| DEFAULT_OBJECT_STORAGE_REGION.into())
        .trim()
        .to_lowercase();
    tigris::validate_allowed_region(&region).map_err(|message| ApiError::bad_request(message))?;

    let access = BucketAccess::parse(body.access.unwrap_or_else(|| "private".into()).as_str())
        .map_err(|e| ApiError::bad_request(e.to_string()))?;

    let id = Uuid::now_v7();
    let provider_bucket_name = provider_app_name(
        &state.config.object_storage_name_prefix,
        workspace_id,
        id,
        &slug,
    );
    let endpoint = state.config.tigris_s3_endpoint.clone();
    let now = Utc::now().fixed_offset();

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO object_storage_buckets (
                id, workspace_id, slug, name, provider, provider_bucket_name,
                region, access, endpoint, status, created_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, 'tigris', $5, $6, $7, $8, 'creating', $9, $10, $10)
            "#,
            [
                id.into(),
                workspace_id.into(),
                slug.into(),
                name.into(),
                provider_bucket_name.clone().into(),
                region.clone().into(),
                access.as_str().into(),
                endpoint.clone().into(),
                created_by.into(),
                now.into(),
            ],
        ))
        .await?;

    let provision = async {
        tigris
            .create_bucket(&provider_bucket_name, &region, access)
            .await
            .map_err(storage_error)?;
        let key_name = format!("{provider_bucket_name}-key");
        let key = tigris
            .create_access_key(&key_name, &provider_bucket_name)
            .await
            .map_err(storage_error)?;
        let encrypted_secret = cipher.encrypt(&key.secret).map_err(storage_error)?;
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE object_storage_buckets
                SET access_key_id = $1,
                    encrypted_secret = $2,
                    status = 'ready',
                    failure_message = NULL,
                    updated_at = $3
                WHERE id = $4 AND workspace_id = $5
                "#,
                [
                    key.id.clone().into(),
                    encrypted_secret.into(),
                    Utc::now().fixed_offset().into(),
                    id.into(),
                    workspace_id.into(),
                ],
            ))
            .await?;
        Ok::<_, ApiError>((key.id, key.secret))
    }
    .await;

    match provision {
        Ok((access_key_id, secret)) => {
            let bucket = load_bucket(state, workspace_id, id).await?;
            Ok(CreatedObjectStorageBucketView {
                bucket: ObjectStorageBucketView {
                    access_key_id: Some(access_key_id),
                    secret_configured: true,
                    ..bucket
                },
                secret_access_key: secret,
            })
        }
        Err(err) => {
            let message = err.to_string();
            let _ = tigris.delete_bucket(&provider_bucket_name).await;
            state
                .db
                .execute(Statement::from_sql_and_values(
                    DatabaseBackend::Postgres,
                    r#"
                    UPDATE object_storage_buckets
                    SET status = 'failed', failure_message = $1, updated_at = $2
                    WHERE id = $3 AND workspace_id = $4
                    "#,
                    [
                        message.clone().into(),
                        Utc::now().fixed_offset().into(),
                        id.into(),
                        workspace_id.into(),
                    ],
                ))
                .await?;
            Err(err)
        }
    }
}

pub async fn delete_bucket(state: &AppState, workspace_id: Uuid, bucket_id: Uuid) -> ApiResult<()> {
    ensure_object_storage_access(state, workspace_id).await?;

    let row = load_bucket_row(state, workspace_id, bucket_id).await?;
    if row.status == "deleting" {
        return Ok(());
    }

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE object_storage_buckets
            SET status = 'deleting', updated_at = $1
            WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL
            "#,
            [
                Utc::now().fixed_offset().into(),
                bucket_id.into(),
                workspace_id.into(),
            ],
        ))
        .await?;

    if let Some(client) = state.tigris.as_ref() {
        if let Some(key_id) = row.access_key_id.as_deref() {
            let _ = client.delete_access_key(key_id).await;
        }
        let _ = client.delete_bucket(&row.provider_bucket_name).await;
    }

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE object_storage_buckets
            SET deleted_at = $1, updated_at = $1
            WHERE id = $2 AND workspace_id = $3
            "#,
            [
                Utc::now().fixed_offset().into(),
                bucket_id.into(),
                workspace_id.into(),
            ],
        ))
        .await?;

    Ok(())
}

async fn bucket_rows(
    state: &AppState,
    workspace_id: Uuid,
    bucket_id: Option<Uuid>,
) -> ApiResult<Vec<ObjectStorageBucketView>> {
    let (sql, values) = if let Some(bucket_id) = bucket_id {
        (
            r#"
            SELECT id, workspace_id, slug, name, provider, provider_bucket_name,
                   region, access, endpoint, access_key_id, encrypted_secret,
                   status, failure_message, created_at, updated_at
            FROM object_storage_buckets
            WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
            "#,
            vec![workspace_id.into(), bucket_id.into()],
        )
    } else {
        (
            r#"
            SELECT id, workspace_id, slug, name, provider, provider_bucket_name,
                   region, access, endpoint, access_key_id, encrypted_secret,
                   status, failure_message, created_at, updated_at
            FROM object_storage_buckets
            WHERE workspace_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            "#,
            vec![workspace_id.into()],
        )
    };

    let rows = BucketRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        sql,
        values,
    ))
    .all(&state.db)
    .await?;

    Ok(rows.into_iter().map(row_to_view).collect())
}

async fn load_bucket_row(
    state: &AppState,
    workspace_id: Uuid,
    bucket_id: Uuid,
) -> ApiResult<BucketRow> {
    let rows = BucketRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, slug, name, provider, provider_bucket_name,
               region, access, endpoint, access_key_id, encrypted_secret,
               status, failure_message, created_at, updated_at
        FROM object_storage_buckets
        WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
        "#,
        [workspace_id.into(), bucket_id.into()],
    ))
    .all(&state.db)
    .await?;

    rows.into_iter()
        .next()
        .ok_or_else(|| ApiError::not_found("bucket not found"))
}

async fn load_bucket(
    state: &AppState,
    workspace_id: Uuid,
    bucket_id: Uuid,
) -> ApiResult<ObjectStorageBucketView> {
    let row = load_bucket_row(state, workspace_id, bucket_id).await?;
    Ok(row_to_view(row))
}

fn row_to_view(row: BucketRow) -> ObjectStorageBucketView {
    ObjectStorageBucketView {
        id: row.id,
        workspace_id: row.workspace_id,
        slug: row.slug,
        name: row.name,
        provider: row.provider,
        provider_bucket_name: row.provider_bucket_name,
        region: row.region,
        access: row.access,
        endpoint: row.endpoint,
        access_key_id: row.access_key_id,
        secret_configured: row.encrypted_secret.is_some(),
        status: row.status,
        failure_message: row.failure_message,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

async fn workspace_bucket_count(state: &AppState, workspace_id: Uuid) -> ApiResult<i64> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::bigint AS count
            FROM object_storage_buckets
            WHERE workspace_id = $1 AND deleted_at IS NULL
            "#,
            [workspace_id.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0))
}

async fn slug_exists(state: &AppState, workspace_id: Uuid, slug: &str) -> ApiResult<bool> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT EXISTS(
                SELECT 1 FROM object_storage_buckets
                WHERE workspace_id = $1 AND slug = $2 AND deleted_at IS NULL
            ) AS exists
            "#,
            [workspace_id.into(), slug.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<bool>("", "exists").ok())
        .unwrap_or(false))
}

fn ensure_object_storage_enabled(state: &AppState) -> ApiResult<()> {
    if !state.config.object_storage_enabled {
        return Err(ApiError::service_unavailable("object storage is disabled"));
    }
    if state.tigris.is_none() {
        return Err(ApiError::service_unavailable(
            "object storage is not configured",
        ));
    }
    Ok(())
}

fn tigris_client(state: &AppState) -> ApiResult<&TigrisClient> {
    ensure_object_storage_enabled(state)?;
    state
        .tigris
        .as_ref()
        .map(|client| client.as_ref())
        .ok_or_else(|| ApiError::service_unavailable("object storage is not configured"))
}

fn storage_cipher(state: &AppState) -> ApiResult<SecretCipher> {
    let key = state.config.deploy_secrets_key.as_deref().ok_or_else(|| {
        ApiError::service_unavailable("object storage encryption is not configured")
    })?;
    SecretCipher::from_hex_key(key).map_err(storage_error)
}

fn storage_error(err: impl std::fmt::Display) -> ApiError {
    ApiError::service_unavailable(format!("object storage error: {err}"))
}

fn clean_text(value: String, min: usize, max: usize, label: &str) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.len() < min {
        return Err(ApiError::bad_request(format!("{label} is too short")));
    }
    if value.len() > max {
        return Err(ApiError::bad_request(format!("{label} is too long")));
    }
    Ok(value)
}

fn validate_slug_like(value: &str, label: &str) -> ApiResult<()> {
    if !slug::is_valid_slug(value) {
        return Err(ApiError::bad_request(format!(
            "{label} must be 3-64 lowercase letters, digits, or hyphens"
        )));
    }
    Ok(())
}
