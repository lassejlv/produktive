use std::time::Duration;

use chrono::{DateTime, FixedOffset, Utc};
use deploy::{provider_app_name, validate_allowed_region, DeployError, DEFAULT_DEPLOY_REGION};
use rand::RngCore;
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use serde_json::json;
use sha2::{Digest, Sha256};
use sprites::{SpriteConfig, SpriteStatus, SpritesClient};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    slug,
    state::AppState,
};

pub const EXEC_OUTPUT_LIMIT: usize = 1_048_576;
pub const EXEC_TIMEOUT: Duration = Duration::from_secs(60);
pub const SANDBOX_API_TOKEN_PREFIX: &str = "prd_sbx_";
const ACCESS_APPROVED: i16 = 1;

#[derive(Clone, Debug)]
pub struct SandboxApiAuth {
    pub workspace_id: Uuid,
    pub _token_id: Uuid,
}

#[derive(Clone, Debug)]
pub struct CreateSandboxInput {
    pub name: String,
    pub slug: Option<String>,
    pub region: Option<String>,
    pub cpus: Option<i32>,
    pub ram_mb: Option<i32>,
    pub storage_gb: Option<i32>,
}

#[derive(Clone, Debug)]
pub struct UpdateSandboxInput {
    pub name: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ExecSandboxInput {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub timeout: Duration,
}

#[derive(Clone, Debug)]
pub struct ExecSandboxOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
    pub timed_out: bool,
}

#[derive(Clone, Debug, serde::Serialize, utoipa::ToSchema)]
pub struct DeploySandboxView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub slug: String,
    pub name: String,
    pub provider_name: String,
    pub region: String,
    pub cpus: i32,
    pub ram_mb: i32,
    pub storage_gb: i32,
    pub status: String,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Clone, Debug, serde::Serialize, utoipa::ToSchema)]
pub struct SandboxCheckpointView {
    pub id: String,
    pub comment: Option<String>,
    pub created_at: Option<DateTime<FixedOffset>>,
    pub source_id: Option<String>,
}

#[derive(FromQueryResult)]
pub(crate) struct SandboxRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub slug: String,
    pub name: String,
    pub provider_name: String,
    pub region: String,
    pub cpus: i32,
    pub ram_mb: i32,
    pub storage_gb: i32,
    pub status: String,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Clone, Debug, serde::Serialize, utoipa::ToSchema)]
pub struct SandboxApiTokenView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub token_prefix: String,
    pub last_used_at: Option<DateTime<FixedOffset>>,
    pub expires_at: Option<DateTime<FixedOffset>>,
    pub revoked_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
}

#[derive(Clone, Debug, serde::Serialize, utoipa::ToSchema)]
pub struct CreatedSandboxApiToken {
    pub token: String,
    pub token_view: SandboxApiTokenView,
}

pub async fn ensure_sandbox_access(state: &AppState, workspace_id: Uuid) -> ApiResult<()> {
    ensure_sandboxes_enabled(state)?;
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT status
            FROM deploy_access_requests
            WHERE workspace_id = $1
            "#,
            [workspace_id.into()],
        ))
        .await?;
    match row.and_then(|row| row.try_get::<i16>("", "status").ok()) {
        Some(ACCESS_APPROVED) => Ok(()),
        _ => Err(ApiError::Forbidden),
    }
}

pub async fn list_sandboxes(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Vec<DeploySandboxView>> {
    ensure_sandbox_access(state, workspace_id).await?;
    sandbox_rows(state, workspace_id, None).await
}

pub async fn get_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
) -> ApiResult<DeploySandboxView> {
    ensure_sandbox_access(state, workspace_id).await?;
    refresh_sandbox(state, workspace_id, sandbox_id).await?;
    load_sandbox(state, workspace_id, sandbox_id).await
}

pub async fn create_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    created_by: Option<Uuid>,
    body: CreateSandboxInput,
) -> ApiResult<DeploySandboxView> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;

    let count = workspace_sandbox_count(state, workspace_id).await?;
    if count >= state.config.sandbox_max_per_workspace {
        return Err(ApiError::payment_required("sandbox limit reached"));
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
        slug::unique_deploy_sandbox_slug(&state.db, workspace_id, &name).await?
    };

    let region = body
        .region
        .unwrap_or_else(|| DEFAULT_DEPLOY_REGION.into())
        .trim()
        .to_lowercase();
    validate_allowed_region(&region).map_err(deploy_validation_error)?;
    let cpus = body.cpus.unwrap_or(1).clamp(1, 8);
    let ram_mb = body.ram_mb.unwrap_or(512).clamp(256, 16_384);
    let storage_gb = body.storage_gb.unwrap_or(10).clamp(1, 100);

    let id = Uuid::now_v7();
    let provider_name = provider_app_name(
        &state.config.sprite_name_prefix,
        workspace_id,
        id,
        &slug,
    );
    let config = SpriteConfig {
        ram_mb: Some(ram_mb as u32),
        cpus: Some(cpus as u32),
        region: Some(region.clone()),
        storage_gb: Some(storage_gb as u32),
    };

    sprites
        .create_with_config(&provider_name, Some(config), None)
        .await
        .map_err(sandbox_error)?;

    let info = sprites.get(&provider_name).await.map_err(sandbox_error)?;
    let status = map_sprite_status(info.status);
    let now = Utc::now().fixed_offset();
    let metadata = json!({
        "organization_name": info.organization_name,
    });

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_sandboxes (
                id, workspace_id, slug, name, provider_name, provider_metadata,
                region, cpus, ram_mb, storage_gb, status, created_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
            "#,
            [
                id.into(),
                workspace_id.into(),
                slug.into(),
                name.into(),
                provider_name.into(),
                metadata.into(),
                region.into(),
                cpus.into(),
                ram_mb.into(),
                storage_gb.into(),
                status.into(),
                created_by.into(),
                now.into(),
            ],
        ))
        .await?;

    load_sandbox(state, workspace_id, id).await
}

pub async fn update_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
    body: UpdateSandboxInput,
) -> ApiResult<DeploySandboxView> {
    ensure_sandbox_access(state, workspace_id).await?;

    if let Some(name) = body.name {
        let name = clean_text(name, 1, 120, "name")?;
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE deploy_sandboxes
                SET name = $1, updated_at = $2
                WHERE id = $3 AND workspace_id = $4 AND deleted_at IS NULL
                "#,
                [
                    name.into(),
                    Utc::now().fixed_offset().into(),
                    sandbox_id.into(),
                    workspace_id.into(),
                ],
            ))
            .await?;
    }

    refresh_sandbox(state, workspace_id, sandbox_id).await?;
    load_sandbox(state, workspace_id, sandbox_id).await
}

pub async fn delete_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
) -> ApiResult<()> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;

    if let Err(error) = sprites.delete(&row.provider_name).await {
        if !matches!(error, sprites::Error::NotFound(_)) {
            return Err(sandbox_error(error));
        }
    }

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_sandboxes
            SET deleted_at = $1, updated_at = $1
            WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL
            "#,
            [
                Utc::now().fixed_offset().into(),
                sandbox_id.into(),
                workspace_id.into(),
            ],
        ))
        .await?;
    Ok(())
}

pub async fn exec_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
    body: ExecSandboxInput,
) -> ApiResult<ExecSandboxOutput> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;

    let command = clean_text(body.command, 1, 256, "command")?;
    if body.args.len() > 64 {
        return Err(ApiError::bad_request("too many args"));
    }
    for arg in &body.args {
        if arg.len() > 4096 {
            return Err(ApiError::bad_request("arg too long"));
        }
    }

    let sprite = sprites.sprite(&row.provider_name);
    let mut cmd = sprite.command(&command);
    for arg in &body.args {
        cmd = cmd.arg(arg);
    }
    if let Some(cwd) = body.cwd {
        let cwd = clean_text(cwd, 1, 512, "cwd")?;
        cmd = cmd.current_dir(cwd);
    }

    let timed_out = match tokio::time::timeout(body.timeout, cmd.output()).await {
        Ok(Ok(output)) => {
            let (stdout, stdout_truncated) = truncate_output(output.stdout_str());
            let (stderr, stderr_truncated) = truncate_output(output.stderr_str());
            return Ok(ExecSandboxOutput {
                exit_code: output.status,
                stdout,
                stderr,
                truncated: stdout_truncated || stderr_truncated,
                timed_out: false,
            });
        }
        Ok(Err(error)) => return Err(sandbox_error(error)),
        Err(_) => true,
    };

    Ok(ExecSandboxOutput {
        exit_code: 124,
        stdout: String::new(),
        stderr: String::new(),
        truncated: false,
        timed_out,
    })
}

pub async fn list_checkpoints(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
) -> ApiResult<Vec<SandboxCheckpointView>> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;
    let sprite = sprites.sprite(&row.provider_name);
    let checkpoints = sprite.list_checkpoints().await.map_err(sandbox_error)?;
    Ok(checkpoints.into_iter().map(checkpoint_view).collect())
}

pub async fn create_checkpoint(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
    comment: Option<String>,
) -> ApiResult<SandboxCheckpointView> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;
    let comment = comment
        .map(|value| clean_text(value, 1, 256, "comment"))
        .transpose()?
        .unwrap_or_else(|| "checkpoint".into());
    let sprite = sprites.sprite(&row.provider_name);
    let checkpoint = sprite.checkpoint(&comment).await.map_err(sandbox_error)?;
    Ok(checkpoint_view(checkpoint))
}

pub async fn restore_checkpoint(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
    checkpoint_id: &str,
) -> ApiResult<()> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;
    validate_checkpoint_id(checkpoint_id)?;
    let sprite = sprites.sprite(&row.provider_name);
    sprite
        .restore(checkpoint_id)
        .await
        .map_err(sandbox_error)?;
    Ok(())
}

pub async fn delete_checkpoint(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
    checkpoint_id: &str,
) -> ApiResult<()> {
    ensure_sandbox_access(state, workspace_id).await?;
    let sprites = sprites_client(state)?;
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;
    validate_checkpoint_id(checkpoint_id)?;

    let url = format!(
        "{}/v1/sprites/{}/checkpoints/{}",
        sprites.base_url(),
        row.provider_name,
        checkpoint_id
    );
    let response = state
        .http
        .delete(&url)
        .header("Authorization", format!("Bearer {}", sprites.token()))
        .send()
        .await
        .map_err(|error| ApiError::service_unavailable(error.to_string()))?;
    if !response.status().is_success() && response.status() != reqwest::StatusCode::NOT_FOUND {
        let message = response.text().await.unwrap_or_default();
        return Err(ApiError::service_unavailable(message));
    }
    Ok(())
}

pub async fn list_api_tokens(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Vec<SandboxApiTokenView>> {
    ensure_sandbox_access(state, workspace_id).await?;
    let rows = SandboxApiTokenRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, name, token_prefix, last_used_at, expires_at, revoked_at, created_at
        FROM deploy_sandbox_api_tokens
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        "#,
        [workspace_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows.into_iter().map(api_token_view).collect())
}

pub async fn create_api_token(
    state: &AppState,
    workspace_id: Uuid,
    created_by: Uuid,
    name: String,
    expires_at: Option<DateTime<FixedOffset>>,
) -> ApiResult<CreatedSandboxApiToken> {
    ensure_sandbox_access(state, workspace_id).await?;
    let name = clean_text(name, 1, 80, "name")?;
    let mut buf = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut buf);
    let token = format!("{SANDBOX_API_TOKEN_PREFIX}{}", hex::encode(buf));
    let token_hash = sha256_hex(&token);
    let token_prefix: String = token
        .chars()
        .take(SANDBOX_API_TOKEN_PREFIX.len() + 6)
        .collect();
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_sandbox_api_tokens (
                id, workspace_id, name, token_hash, token_prefix, expires_at, created_by, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            [
                id.into(),
                workspace_id.into(),
                name.clone().into(),
                token_hash.into(),
                token_prefix.clone().into(),
                expires_at.into(),
                created_by.into(),
                now.into(),
            ],
        ))
        .await?;

    let view = SandboxApiTokenView {
        id,
        workspace_id,
        name,
        token_prefix,
        last_used_at: None,
        expires_at,
        revoked_at: None,
        created_at: now,
    };

    Ok(CreatedSandboxApiToken { token, token_view: view })
}

pub async fn revoke_api_token(
    state: &AppState,
    workspace_id: Uuid,
    token_id: Uuid,
) -> ApiResult<()> {
    ensure_sandbox_access(state, workspace_id).await?;
    let now = Utc::now().fixed_offset();
    let result = state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_sandbox_api_tokens
            SET revoked_at = $1
            WHERE id = $2 AND workspace_id = $3 AND revoked_at IS NULL
            "#,
            [now.into(), token_id.into(), workspace_id.into()],
        ))
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("sandbox api token not found"));
    }
    Ok(())
}

pub async fn authenticate_api_token(
    state: &AppState,
    token: &str,
) -> ApiResult<SandboxApiAuth> {
    ensure_sandboxes_enabled(state)?;
    if !token.starts_with(SANDBOX_API_TOKEN_PREFIX) {
        return Err(ApiError::Unauthorized);
    }
    let token_hash = sha256_hex(token);
    let row = SandboxApiTokenAuthRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, expires_at, revoked_at
        FROM deploy_sandbox_api_tokens
        WHERE token_hash = $1
        "#,
        [token_hash.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or(ApiError::Unauthorized)?;

    if row.revoked_at.is_some() {
        return Err(ApiError::Unauthorized);
    }
    if let Some(expires_at) = row.expires_at {
        if expires_at < Utc::now().fixed_offset() {
            return Err(ApiError::Unauthorized);
        }
    }

    ensure_sandbox_access(state, row.workspace_id).await?;

    let now = Utc::now().fixed_offset();
    let _ = state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_sandbox_api_tokens
            SET last_used_at = $1
            WHERE id = $2
            "#,
            [now.into(), row.id.into()],
        ))
        .await;

    Ok(SandboxApiAuth {
        workspace_id: row.workspace_id,
        _token_id: row.id,
    })
}

pub fn public_status(status: &str) -> &'static str {
    match status {
        "active" => "RUNNING",
        "warm" => "STARTING",
        "cold" => "COLD",
        "stopped" => "STOPPED",
        _ => "UNKNOWN",
    }
}

async fn sandbox_rows(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Option<Uuid>,
) -> ApiResult<Vec<DeploySandboxView>> {
    let rows = if let Some(id) = sandbox_id {
        SandboxRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT id, workspace_id, slug, name, provider_name,
                   region, cpus, ram_mb, storage_gb, status, created_at, updated_at
            FROM deploy_sandboxes
            WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
            "#,
            [workspace_id.into(), id.into()],
        ))
        .all(&state.db)
        .await?
    } else {
        SandboxRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT id, workspace_id, slug, name, provider_name,
                   region, cpus, ram_mb, storage_gb, status, created_at, updated_at
            FROM deploy_sandboxes
            WHERE workspace_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            "#,
            [workspace_id.into()],
        ))
        .all(&state.db)
        .await?
    };

    Ok(rows.into_iter().map(sandbox_view).collect())
}

async fn load_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
) -> ApiResult<DeploySandboxView> {
    sandbox_rows(state, workspace_id, Some(sandbox_id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::not_found("sandbox not found"))
}

async fn ensure_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
) -> ApiResult<SandboxRow> {
    SandboxRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, slug, name, provider_name,
               region, cpus, ram_mb, storage_gb, status, created_at, updated_at
        FROM deploy_sandboxes
        WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
        "#,
        [workspace_id.into(), sandbox_id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("sandbox not found"))
}

async fn refresh_sandbox(
    state: &AppState,
    workspace_id: Uuid,
    sandbox_id: Uuid,
) -> ApiResult<()> {
    let Some(sprites) = state.sprites.as_ref() else {
        return Ok(());
    };
    let row = ensure_sandbox(state, workspace_id, sandbox_id).await?;
    let info = match sprites.get(&row.provider_name).await {
        Ok(info) => info,
        Err(sprites::Error::NotFound(_)) => return Ok(()),
        Err(error) => return Err(sandbox_error(error)),
    };
    let status = map_sprite_status(info.status);
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_sandboxes
            SET status = $1, updated_at = $2
            WHERE id = $3 AND workspace_id = $4 AND deleted_at IS NULL
            "#,
            [
                status.into(),
                Utc::now().fixed_offset().into(),
                sandbox_id.into(),
                workspace_id.into(),
            ],
        ))
        .await?;
    Ok(())
}

async fn workspace_sandbox_count(state: &AppState, workspace_id: Uuid) -> ApiResult<i64> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::BIGINT AS count
            FROM deploy_sandboxes
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
                SELECT 1 FROM deploy_sandboxes
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

#[derive(FromQueryResult)]
struct SandboxApiTokenRow {
    id: Uuid,
    workspace_id: Uuid,
    name: String,
    token_prefix: String,
    last_used_at: Option<DateTime<FixedOffset>>,
    expires_at: Option<DateTime<FixedOffset>>,
    revoked_at: Option<DateTime<FixedOffset>>,
    created_at: DateTime<FixedOffset>,
}

#[derive(FromQueryResult)]
struct SandboxApiTokenAuthRow {
    id: Uuid,
    workspace_id: Uuid,
    expires_at: Option<DateTime<FixedOffset>>,
    revoked_at: Option<DateTime<FixedOffset>>,
}

fn api_token_view(row: SandboxApiTokenRow) -> SandboxApiTokenView {
    SandboxApiTokenView {
        id: row.id,
        workspace_id: row.workspace_id,
        name: row.name,
        token_prefix: row.token_prefix,
        last_used_at: row.last_used_at,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        created_at: row.created_at,
    }
}

fn sandbox_view(row: SandboxRow) -> DeploySandboxView {
    DeploySandboxView {
        id: row.id,
        workspace_id: row.workspace_id,
        slug: row.slug,
        name: row.name,
        provider_name: row.provider_name,
        region: row.region,
        cpus: row.cpus,
        ram_mb: row.ram_mb,
        storage_gb: row.storage_gb,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn checkpoint_view(checkpoint: sprites::Checkpoint) -> SandboxCheckpointView {
    SandboxCheckpointView {
        id: checkpoint.id,
        comment: checkpoint.comment,
        created_at: checkpoint.created_at.map(|value| value.fixed_offset()),
        source_id: checkpoint.source_id,
    }
}

fn ensure_sandboxes_enabled(state: &AppState) -> ApiResult<()> {
    if !state.config.sandboxes_enabled {
        return Err(ApiError::service_unavailable("sandboxes are disabled"));
    }
    if state.sprites.is_none() {
        return Err(ApiError::service_unavailable("sprites is not configured"));
    }
    Ok(())
}

fn sprites_client(state: &AppState) -> ApiResult<&SpritesClient> {
    ensure_sandboxes_enabled(state)?;
    state
        .sprites
        .as_deref()
        .ok_or_else(|| ApiError::service_unavailable("sprites is not configured"))
}

fn clean_text(value: String, min: usize, max: usize, label: &str) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.len() < min {
        return Err(ApiError::bad_request(format!("{label} is required")));
    }
    if value.len() > max {
        return Err(ApiError::bad_request(format!(
            "{label} must be {max} characters or fewer"
        )));
    }
    Ok(value)
}

fn validate_slug_like(value: &str, label: &str) -> ApiResult<()> {
    if slug::is_valid_slug(value) {
        Ok(())
    } else {
        Err(ApiError::bad_request(format!("invalid {label}")))
    }
}

fn validate_checkpoint_id(value: &str) -> ApiResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if valid {
        Ok(())
    } else {
        Err(ApiError::bad_request("invalid checkpoint id"))
    }
}

fn map_sprite_status(status: SpriteStatus) -> String {
    match status {
        SpriteStatus::Cold => "cold".into(),
        SpriteStatus::Warm => "warm".into(),
        SpriteStatus::Running => "active".into(),
        SpriteStatus::Stopped => "stopped".into(),
    }
}

fn truncate_output(value: String) -> (String, bool) {
    if value.len() <= EXEC_OUTPUT_LIMIT {
        (value, false)
    } else {
        let truncated = value.chars().take(EXEC_OUTPUT_LIMIT).collect();
        (truncated, true)
    }
}

fn sha256_hex(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    hex::encode(digest)
}

fn sandbox_error(error: sprites::Error) -> ApiError {
    match error {
        sprites::Error::NotFound(message) => ApiError::not_found(message),
        sprites::Error::Api { status, message } if status == 429 => {
            ApiError::too_many_requests(message)
        }
        sprites::Error::Api { message, .. }
        | sprites::Error::InvalidResponse(message)
        | sprites::Error::Connection(message)
        | sprites::Error::ExecFailed { message, .. } => ApiError::service_unavailable(message),
        sprites::Error::Http(error) => ApiError::service_unavailable(error.to_string()),
        sprites::Error::WebSocket(error) => ApiError::service_unavailable(error.to_string()),
        sprites::Error::Json(error) => ApiError::service_unavailable(error.to_string()),
        sprites::Error::InvalidUrl(error) => ApiError::bad_request(error.to_string()),
        sprites::Error::Timeout => ApiError::bad_request("operation timed out"),
        sprites::Error::Io(error) => ApiError::service_unavailable(error.to_string()),
    }
}

fn deploy_validation_error(error: DeployError) -> ApiError {
    match error {
        DeployError::Validation(message) | DeployError::Config(message) => {
            ApiError::bad_request(message)
        }
        DeployError::NotFound(message) => ApiError::not_found(message),
        DeployError::RateLimited(message) => ApiError::too_many_requests(message),
        DeployError::Provider(message) | DeployError::Transport(message) => {
            ApiError::service_unavailable(message)
        }
        DeployError::Crypto(message) | DeployError::Decode(message) => {
            ApiError::Internal(anyhow::anyhow!(message))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_public_status_labels() {
        assert_eq!(public_status("active"), "RUNNING");
        assert_eq!(public_status("cold"), "COLD");
    }

    #[test]
    fn truncates_large_exec_output() {
        let value = "x".repeat(EXEC_OUTPUT_LIMIT + 10);
        let (truncated, did_truncate) = truncate_output(value);
        assert!(did_truncate);
        assert_eq!(truncated.len(), EXEC_OUTPUT_LIMIT);
    }
}
