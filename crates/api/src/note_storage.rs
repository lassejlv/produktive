use crate::{error::ApiError, state::AppState, storage};
use anyhow::anyhow;
use produktive_entity::note;
use sha2::{Digest, Sha256};

const NOTE_CONTENT_TYPE: &str = "text/markdown; charset=utf-8";

pub struct StoredNoteBody {
    pub object_key: String,
    pub sha256: String,
    pub snippet: String,
}

pub async fn read_current_body(state: &AppState, note: &note::Model) -> Result<String, ApiError> {
    let key = note
        .current_object_key
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Note body is not stored in S3 yet".to_owned()))?;
    read_body_key(state, key).await
}

pub async fn read_body_key(state: &AppState, object_key: &str) -> Result<String, ApiError> {
    let config = state.config.storage.as_ref().ok_or_else(|| {
        ApiError::BadRequest("File storage is not configured for notes".to_owned())
    })?;
    storage::get_text_object(config, object_key).await
}

pub async fn write_current_body(
    state: &AppState,
    organization_id: &str,
    note_id: &str,
    body_markdown: &str,
) -> Result<StoredNoteBody, ApiError> {
    let object_key = storage::safe_note_current_key(organization_id, note_id);
    write_body(state, object_key, body_markdown).await
}

pub async fn write_version_body(
    state: &AppState,
    organization_id: &str,
    note_id: &str,
    version_id: &str,
    body_markdown: &str,
) -> Result<StoredNoteBody, ApiError> {
    let object_key = storage::safe_note_version_key(organization_id, note_id, version_id);
    write_body(state, object_key, body_markdown).await
}

pub fn body_sha256(body_markdown: &str) -> String {
    hex::encode(Sha256::digest(body_markdown.as_bytes()))
}

pub fn body_snippet(body_markdown: &str) -> String {
    body_markdown
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(512)
        .collect()
}

async fn write_body(
    state: &AppState,
    object_key: String,
    body_markdown: &str,
) -> Result<StoredNoteBody, ApiError> {
    let config = state.config.storage.as_ref().ok_or_else(|| {
        ApiError::BadRequest("File storage is not configured for notes".to_owned())
    })?;
    storage::put_object(
        config,
        &object_key,
        NOTE_CONTENT_TYPE,
        body_markdown.as_bytes().to_vec(),
    )
    .await
    .map_err(|error| ApiError::Internal(anyhow!("failed to write note body: {error}")))?;

    Ok(StoredNoteBody {
        object_key,
        sha256: body_sha256(body_markdown),
        snippet: body_snippet(body_markdown),
    })
}
