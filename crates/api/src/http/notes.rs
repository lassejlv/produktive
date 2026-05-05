use crate::{auth::require_auth, error::ApiError, note_storage, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use produktive_ai::{CompletionResult, Message as AiMessage};
use produktive_entity::{
    chat, chat_access, issue, member, note, note_folder, note_mention, note_version, user,
};
use regex::Regex;
use sea_orm::{
    sea_query::Expr, ActiveModelTrait, ColumnTrait, Condition, EntityTrait, IntoActiveModel,
    QueryFilter, QueryOrder, QuerySelect, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use uuid::Uuid;

const MENTION_LIMIT: u64 = 8;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_notes).post(create_note))
        .route("/mentions", get(search_mentions))
        .route("/folders", get(list_folders).post(create_folder))
        .route(
            "/folders/{id}",
            get(get_folder).patch(update_folder).delete(archive_folder),
        )
        .route("/{id}/ai/edit", axum::routing::post(propose_ai_edit))
        .route("/{id}/versions", get(list_versions))
        .route("/{id}/commit", axum::routing::post(commit_note))
        .route(
            "/{id}/versions/{version_id}/restore",
            axum::routing::post(restore_version),
        )
        .route(
            "/{id}",
            get(get_note).patch(update_note).delete(archive_note),
        )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListNotesQuery {
    search: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MentionSearchQuery {
    q: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateNoteRequest {
    title: Option<String>,
    body_markdown: Option<String>,
    folder_id: Option<String>,
    visibility: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNoteRequest {
    title: Option<String>,
    body_markdown: Option<String>,
    folder_id: Option<Option<String>>,
    visibility: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFolderRequest {
    name: String,
    visibility: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateFolderRequest {
    name: Option<String>,
    visibility: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteAiEditRequest {
    selected_text: String,
    instruction: Option<String>,
    title: Option<String>,
    body_markdown: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitNoteRequest {
    message: Option<String>,
}

#[derive(Serialize)]
struct NotesEnvelope {
    notes: Vec<NoteResponse>,
}

#[derive(Serialize)]
struct NoteEnvelope {
    note: NoteResponse,
}

#[derive(Serialize)]
struct FoldersEnvelope {
    folders: Vec<FolderResponse>,
}

#[derive(Serialize)]
struct FolderEnvelope {
    folder: FolderResponse,
}

#[derive(Serialize)]
struct NoteVersionsEnvelope {
    versions: Vec<NoteVersionResponse>,
}

#[derive(Serialize)]
struct NoteVersionEnvelope {
    version: NoteVersionResponse,
}

#[derive(Serialize)]
struct MentionSearchEnvelope {
    mentions: Vec<MentionSearchResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteAiEditResponse {
    replacement_markdown: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteResponse {
    id: String,
    folder_id: Option<String>,
    title: String,
    body_markdown: String,
    committed_body_markdown: Option<String>,
    body_snippet: Option<String>,
    body_sha256: Option<String>,
    current_version_id: Option<String>,
    has_uncommitted_changes: bool,
    latest_version: Option<NoteVersionResponse>,
    visibility: String,
    created_by: Option<UserSummary>,
    updated_by: Option<UserSummary>,
    mentions: Vec<ResolvedMention>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteVersionResponse {
    id: String,
    note_id: String,
    body_sha256: String,
    parent_version_id: Option<String>,
    commit_message: Option<String>,
    created_by: Option<UserSummary>,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderResponse {
    id: String,
    name: String,
    visibility: String,
    created_by: Option<UserSummary>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSummary {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedMention {
    target_type: String,
    target_id: String,
    label: String,
    subtitle: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MentionSearchResult {
    target_type: String,
    target_id: String,
    label: String,
    subtitle: Option<String>,
}

async fn list_notes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListNotesQuery>,
) -> Result<Json<NotesEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let mut select = note::Entity::find()
        .filter(note::Column::OrganizationId.eq(&auth.organization.id))
        .filter(note::Column::ArchivedAt.is_null())
        .filter(visible_note_condition(&auth.user.id))
        .order_by_desc(note::Column::UpdatedAt);

    if let Some(search) = clean_search(query.search.as_deref()) {
        select = select.filter(
            Condition::any()
                .add(note::Column::Title.contains(&search))
                .add(note::Column::BodySnippet.contains(&search)),
        );
    }

    let notes = select.all(&state.db).await?;
    let mut response = Vec::with_capacity(notes.len());
    for note in notes {
        response.push(note_summary_response(&state, note).await?);
    }

    Ok(Json(NotesEnvelope { notes: response }))
}

async fn create_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateNoteRequest>,
) -> Result<(StatusCode, Json<NoteEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let title = normalize_title(payload.title.as_deref());
    let body = payload.body_markdown.unwrap_or_default();
    let folder = validate_folder(
        &state,
        &auth.organization.id,
        &auth.user.id,
        payload.folder_id.as_deref(),
    )
    .await?;
    let mut visibility = normalize_visibility(payload.visibility.as_deref())?;
    if folder
        .as_ref()
        .is_some_and(|folder| folder.visibility == "private")
    {
        visibility = "private".to_owned();
    }
    let folder_id = folder.map(|folder| folder.id);
    let note_id = Uuid::new_v4().to_string();
    let version_id = Uuid::new_v4().to_string();
    let current_body =
        note_storage::write_current_body(&state, &auth.organization.id, &note_id, &body).await?;
    let version_body = note_storage::write_version_body(
        &state,
        &auth.organization.id,
        &note_id,
        &version_id,
        &body,
    )
    .await?;

    let txn = state.db.begin().await?;
    let model = note::ActiveModel {
        id: Set(note_id.clone()),
        organization_id: Set(auth.organization.id.clone()),
        folder_id: Set(folder_id),
        title: Set(title),
        body_markdown: Set(String::new()),
        current_object_key: Set(Some(current_body.object_key)),
        current_version_id: Set(Some(version_id.clone())),
        body_sha256: Set(Some(current_body.sha256)),
        body_snippet: Set(Some(current_body.snippet)),
        visibility: Set(visibility),
        created_by_id: Set(Some(auth.user.id.clone())),
        updated_by_id: Set(Some(auth.user.id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;
    note_version::ActiveModel {
        id: Set(version_id),
        note_id: Set(note_id.clone()),
        object_key: Set(version_body.object_key),
        body_sha256: Set(version_body.sha256),
        parent_version_id: Set(None),
        commit_message: Set(Some("Initial version".to_owned())),
        created_by_id: Set(Some(auth.user.id.clone())),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;
    sync_mentions(&txn, &note_id, &body, now).await?;
    txn.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(NoteEnvelope {
            note: note_response(&state, &auth.organization.id, &auth.user.id, model).await?,
        }),
    ))
}

async fn get_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<NoteEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let note = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    Ok(Json(NoteEnvelope {
        note: note_response(&state, &auth.organization.id, &auth.user.id, note).await?,
    }))
}

async fn update_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateNoteRequest>,
) -> Result<Json<NoteEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let existing = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let now = Utc::now().fixed_offset();
    let body_update = if let Some(body) = payload.body_markdown {
        Some(
            note_storage::write_current_body(&state, &auth.organization.id, &existing.id, &body)
                .await?,
        )
    } else {
        None
    };
    let mut next_visibility = if let Some(visibility) = payload.visibility.as_deref() {
        normalize_visibility(Some(visibility))?
    } else {
        existing.visibility.clone()
    };
    let mut next_folder_id = existing.folder_id.clone();
    if let Some(folder_id) = payload.folder_id {
        let folder = validate_folder(
            &state,
            &auth.organization.id,
            &auth.user.id,
            folder_id.as_deref(),
        )
        .await?;
        if folder
            .as_ref()
            .is_some_and(|folder| folder.visibility == "private")
        {
            next_visibility = "private".to_owned();
        }
        next_folder_id = folder.map(|folder| folder.id);
    } else if let Some(folder_id) = next_folder_id.as_deref() {
        let folder = find_folder(&state, &auth.organization.id, &auth.user.id, folder_id).await?;
        if folder.visibility == "private" {
            next_visibility = "private".to_owned();
        }
    }
    let mut active = existing.into_active_model();
    if let Some(title) = payload.title.as_deref() {
        active.title = Set(normalize_title(Some(title)));
    }
    active.folder_id = Set(next_folder_id);
    active.visibility = Set(next_visibility);
    if let Some(body_update) = body_update.as_ref() {
        active.body_markdown = Set(String::new());
        active.current_object_key = Set(Some(body_update.object_key.clone()));
        active.body_sha256 = Set(Some(body_update.sha256.clone()));
        active.body_snippet = Set(Some(body_update.snippet.clone()));
    }
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);

    let txn = state.db.begin().await?;
    let updated = active.update(&txn).await?;
    if body_update.is_some() {
        let body = note_storage::read_current_body(&state, &updated).await?;
        sync_mentions(&txn, &updated.id, &body, now).await?;
    }
    txn.commit().await?;

    Ok(Json(NoteEnvelope {
        note: note_response(&state, &auth.organization.id, &auth.user.id, updated).await?,
    }))
}

async fn list_versions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<NoteVersionsEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let note = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let versions = note_version::Entity::find()
        .filter(note_version::Column::NoteId.eq(&note.id))
        .order_by_desc(note_version::Column::CreatedAt)
        .all(&state.db)
        .await?;
    let mut response = Vec::with_capacity(versions.len());
    for version in versions {
        response.push(note_version_response(&state, version).await?);
    }
    Ok(Json(NoteVersionsEnvelope { versions: response }))
}

async fn commit_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<CommitNoteRequest>,
) -> Result<Json<NoteVersionEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let note = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let body = note_storage::read_current_body(&state, &note).await?;
    let body_hash = note_storage::body_sha256(&body);

    if let Some(current_version_id) = note.current_version_id.as_deref() {
        if let Some(current_version) = note_version::Entity::find_by_id(current_version_id)
            .filter(note_version::Column::NoteId.eq(&note.id))
            .one(&state.db)
            .await?
        {
            if current_version.body_sha256 == body_hash {
                return Ok(Json(NoteVersionEnvelope {
                    version: note_version_response(&state, current_version).await?,
                }));
            }
        }
    }

    let now = Utc::now().fixed_offset();
    let version_id = Uuid::new_v4().to_string();
    let version_body = note_storage::write_version_body(
        &state,
        &auth.organization.id,
        &note.id,
        &version_id,
        &body,
    )
    .await?;
    let commit_message = payload
        .message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(240).collect::<String>());

    let txn = state.db.begin().await?;
    let version = note_version::ActiveModel {
        id: Set(version_id.clone()),
        note_id: Set(note.id.clone()),
        object_key: Set(version_body.object_key),
        body_sha256: Set(version_body.sha256),
        parent_version_id: Set(note.current_version_id.clone()),
        commit_message: Set(commit_message),
        created_by_id: Set(Some(auth.user.id.clone())),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;
    let mut active = note.into_active_model();
    active.current_version_id = Set(Some(version_id));
    active.body_sha256 = Set(Some(body_hash));
    active.body_snippet = Set(Some(note_storage::body_snippet(&body)));
    active.updated_by_id = Set(Some(auth.user.id));
    active.updated_at = Set(now);
    active.update(&txn).await?;
    txn.commit().await?;

    Ok(Json(NoteVersionEnvelope {
        version: note_version_response(&state, version).await?,
    }))
}

async fn restore_version(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, version_id)): Path<(String, String)>,
) -> Result<Json<NoteEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let note = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let version = note_version::Entity::find_by_id(&version_id)
        .filter(note_version::Column::NoteId.eq(&note.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Note version not found".to_owned()))?;
    let body = note_storage::read_body_key(&state, &version.object_key).await?;
    let current_body =
        note_storage::write_current_body(&state, &auth.organization.id, &note.id, &body).await?;
    let now = Utc::now().fixed_offset();

    let txn = state.db.begin().await?;
    let mut active = note.into_active_model();
    active.current_object_key = Set(Some(current_body.object_key));
    active.current_version_id = Set(Some(version.id.clone()));
    active.body_sha256 = Set(Some(current_body.sha256));
    active.body_snippet = Set(Some(current_body.snippet));
    active.body_markdown = Set(String::new());
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);
    let updated = active.update(&txn).await?;
    sync_mentions(&txn, &updated.id, &body, now).await?;
    txn.commit().await?;

    Ok(Json(NoteEnvelope {
        note: note_response(&state, &auth.organization.id, &auth.user.id, updated).await?,
    }))
}

async fn archive_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let existing = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let now = Utc::now().fixed_offset();
    let mut active = existing.into_active_model();
    active.archived_at = Set(Some(now));
    active.updated_by_id = Set(Some(auth.user.id));
    active.updated_at = Set(now);
    active.update(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn propose_ai_edit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<NoteAiEditRequest>,
) -> Result<Json<NoteAiEditResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let note = find_note(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let selected_text = payload.selected_text.trim();
    if selected_text.is_empty() {
        return Err(ApiError::BadRequest("Select text to edit first".to_owned()));
    }
    let instruction = payload
        .instruction
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Improve the selected note text. Keep it concise, clear, and useful.");
    let title = payload.title.unwrap_or_else(|| note.title.clone());
    let body_markdown = match payload.body_markdown {
        Some(body) => body,
        None => note_storage::read_current_body(&state, &note).await?,
    };
    let prompt = json!({
        "note_title": title,
        "note_markdown_context": truncate_for_ai(&body_markdown, 12000),
        "selected_text": selected_text,
        "instruction": instruction,
    })
    .to_string();

    let result = state
        .ai
        .complete(
            &state.config.ai_model,
            note_edit_system_prompt(),
            &[AiMessage::user(prompt)],
            &[],
        )
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("AI request failed: {error}")))?;

    let text = match result {
        CompletionResult::Text { text, .. } => text,
        CompletionResult::ToolCalls { .. } => {
            return Err(ApiError::Internal(anyhow::anyhow!(
                "AI returned tool calls for a note edit"
            )))
        }
    };

    let replacement_markdown = clean_ai_replacement(&text);
    if replacement_markdown.is_empty() {
        return Err(ApiError::Internal(anyhow::anyhow!(
            "AI returned an empty note edit"
        )));
    }

    Ok(Json(NoteAiEditResponse {
        replacement_markdown,
    }))
}

async fn list_folders(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FoldersEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let folders = note_folder::Entity::find()
        .filter(note_folder::Column::OrganizationId.eq(&auth.organization.id))
        .filter(note_folder::Column::ArchivedAt.is_null())
        .filter(visible_folder_condition(&auth.user.id))
        .order_by_asc(note_folder::Column::Name)
        .all(&state.db)
        .await?;
    let mut response = Vec::with_capacity(folders.len());
    for folder in folders {
        response.push(folder_response(&state, folder).await?);
    }
    Ok(Json(FoldersEnvelope { folders: response }))
}

async fn create_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateFolderRequest>,
) -> Result<(StatusCode, Json<FolderEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let folder = note_folder::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id),
        name: Set(normalize_folder_name(&payload.name)?),
        visibility: Set(normalize_visibility(payload.visibility.as_deref())?),
        created_by_id: Set(Some(auth.user.id.clone())),
        updated_by_id: Set(Some(auth.user.id)),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(FolderEnvelope {
            folder: folder_response(&state, folder).await?,
        }),
    ))
}

async fn get_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<FolderEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let folder = find_folder(&state, &auth.organization.id, &auth.user.id, &id).await?;
    Ok(Json(FolderEnvelope {
        folder: folder_response(&state, folder).await?,
    }))
}

async fn update_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateFolderRequest>,
) -> Result<Json<FolderEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let folder = find_folder(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let now = Utc::now().fixed_offset();
    let mut active = folder.into_active_model();
    let mut make_notes_private = false;
    if let Some(name) = payload.name.as_deref() {
        active.name = Set(normalize_folder_name(name)?);
    }
    if let Some(visibility) = payload.visibility.as_deref() {
        let visibility = normalize_visibility(Some(visibility))?;
        make_notes_private = visibility == "private";
        active.visibility = Set(visibility);
    }
    active.updated_by_id = Set(Some(auth.user.id));
    active.updated_at = Set(now);
    let txn = state.db.begin().await?;
    let updated = active.update(&txn).await?;
    if make_notes_private {
        note::Entity::update_many()
            .filter(note::Column::FolderId.eq(&id))
            .col_expr(note::Column::Visibility, Expr::value("private"))
            .exec(&txn)
            .await?;
    }
    txn.commit().await?;
    Ok(Json(FolderEnvelope {
        folder: folder_response(&state, updated).await?,
    }))
}

async fn archive_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let folder = find_folder(&state, &auth.organization.id, &auth.user.id, &id).await?;
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    let mut active = folder.into_active_model();
    active.archived_at = Set(Some(now));
    active.updated_by_id = Set(Some(auth.user.id));
    active.updated_at = Set(now);
    active.update(&txn).await?;
    note::Entity::update_many()
        .filter(note::Column::FolderId.eq(&id))
        .col_expr(note::Column::FolderId, Expr::value(Option::<String>::None))
        .exec(&txn)
        .await?;
    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn search_mentions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MentionSearchQuery>,
) -> Result<Json<MentionSearchEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let search = clean_search(query.q.as_deref()).unwrap_or_default();
    let mut mentions = Vec::new();

    let mut issue_select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_desc(issue::Column::UpdatedAt)
        .limit(MENTION_LIMIT);
    if !search.is_empty() {
        issue_select = issue_select.filter(issue::Column::Title.contains(&search));
    }
    for issue in issue_select.all(&state.db).await? {
        mentions.push(MentionSearchResult {
            target_type: "issue".to_owned(),
            target_id: issue.id,
            label: issue.title,
            subtitle: Some(format!("Issue · {}", issue.status)),
        });
    }

    let accessible_chat_ids = chat_access::Entity::find()
        .filter(chat_access::Column::UserId.eq(&auth.user.id))
        .all(&state.db)
        .await?
        .into_iter()
        .map(|row| row.chat_id)
        .collect::<Vec<_>>();
    if !accessible_chat_ids.is_empty() {
        let mut chat_select = chat::Entity::find()
            .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
            .filter(chat::Column::Id.is_in(accessible_chat_ids))
            .order_by_desc(chat::Column::UpdatedAt)
            .limit(MENTION_LIMIT);
        if !search.is_empty() {
            chat_select = chat_select.filter(chat::Column::Title.contains(&search));
        }
        for chat in chat_select.all(&state.db).await? {
            mentions.push(MentionSearchResult {
                target_type: "chat".to_owned(),
                target_id: chat.id,
                label: chat.title,
                subtitle: Some("Chat".to_owned()),
            });
        }
    }

    let memberships = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .all(&state.db)
        .await?;
    let member_ids = memberships
        .into_iter()
        .map(|membership| membership.user_id)
        .collect::<Vec<_>>();
    if !member_ids.is_empty() {
        let mut user_select = user::Entity::find()
            .filter(user::Column::Id.is_in(member_ids))
            .order_by_asc(user::Column::Name)
            .limit(MENTION_LIMIT);
        if !search.is_empty() {
            user_select = user_select.filter(
                Condition::any()
                    .add(user::Column::Name.contains(&search))
                    .add(user::Column::Email.contains(&search)),
            );
        }
        for user in user_select.all(&state.db).await? {
            mentions.push(MentionSearchResult {
                target_type: "user".to_owned(),
                target_id: user.id,
                label: user.name,
                subtitle: Some(user.email),
            });
        }
    }

    Ok(Json(MentionSearchEnvelope { mentions }))
}

async fn find_note(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    id: &str,
) -> Result<note::Model, ApiError> {
    note::Entity::find()
        .filter(note::Column::Id.eq(id))
        .filter(note::Column::OrganizationId.eq(organization_id))
        .filter(note::Column::ArchivedAt.is_null())
        .filter(visible_note_condition(user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Note not found".to_owned()))
}

async fn find_folder(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    id: &str,
) -> Result<note_folder::Model, ApiError> {
    note_folder::Entity::find()
        .filter(note_folder::Column::Id.eq(id))
        .filter(note_folder::Column::OrganizationId.eq(organization_id))
        .filter(note_folder::Column::ArchivedAt.is_null())
        .filter(visible_folder_condition(user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Folder not found".to_owned()))
}

async fn note_response(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    note: note::Model,
) -> Result<NoteResponse, ApiError> {
    let created_by = user_summary(state, note.created_by_id.as_deref()).await?;
    let updated_by = user_summary(state, note.updated_by_id.as_deref()).await?;
    let mentions = resolved_mentions(state, organization_id, user_id, &note.id).await?;
    let body_markdown = note_storage::read_current_body(state, &note).await?;
    let latest_version = latest_note_version(state, &note.id).await?;
    let current_version = current_note_version(state, &note).await?;
    let latest_version_response = match latest_version.clone() {
        Some(version) => Some(note_version_response(state, version).await?),
        None => None,
    };
    let has_uncommitted_changes = match current_version.as_ref() {
        Some(version) => note.body_sha256.as_deref() != Some(version.body_sha256.as_str()),
        None => true,
    };
    let committed_body_markdown = match current_version.as_ref() {
        Some(version) if has_uncommitted_changes => {
            Some(note_storage::read_body_key(state, &version.object_key).await?)
        }
        _ => None,
    };
    Ok(NoteResponse {
        id: note.id,
        folder_id: note.folder_id,
        title: note.title,
        body_markdown,
        committed_body_markdown,
        body_snippet: note.body_snippet,
        body_sha256: note.body_sha256,
        current_version_id: note.current_version_id,
        has_uncommitted_changes,
        latest_version: latest_version_response,
        visibility: note.visibility,
        created_by,
        updated_by,
        mentions,
        created_at: note.created_at.to_rfc3339(),
        updated_at: note.updated_at.to_rfc3339(),
        archived_at: note.archived_at.map(|value| value.to_rfc3339()),
    })
}

async fn note_summary_response(
    state: &AppState,
    note: note::Model,
) -> Result<NoteResponse, ApiError> {
    let created_by = user_summary(state, note.created_by_id.as_deref()).await?;
    let updated_by = user_summary(state, note.updated_by_id.as_deref()).await?;
    let current_version = current_note_version(state, &note).await?;
    let has_uncommitted_changes = match current_version.as_ref() {
        Some(version) => note.body_sha256.as_deref() != Some(version.body_sha256.as_str()),
        None => true,
    };
    Ok(NoteResponse {
        id: note.id,
        folder_id: note.folder_id,
        title: note.title,
        body_markdown: String::new(),
        committed_body_markdown: None,
        body_snippet: note.body_snippet,
        body_sha256: note.body_sha256,
        current_version_id: note.current_version_id,
        has_uncommitted_changes,
        latest_version: None,
        visibility: note.visibility,
        created_by,
        updated_by,
        mentions: Vec::new(),
        created_at: note.created_at.to_rfc3339(),
        updated_at: note.updated_at.to_rfc3339(),
        archived_at: note.archived_at.map(|value| value.to_rfc3339()),
    })
}

async fn latest_note_version(
    state: &AppState,
    note_id: &str,
) -> Result<Option<note_version::Model>, ApiError> {
    note_version::Entity::find()
        .filter(note_version::Column::NoteId.eq(note_id))
        .order_by_desc(note_version::Column::CreatedAt)
        .one(&state.db)
        .await
        .map_err(ApiError::from)
}

async fn current_note_version(
    state: &AppState,
    note: &note::Model,
) -> Result<Option<note_version::Model>, ApiError> {
    let Some(version_id) = note.current_version_id.as_deref() else {
        return Ok(None);
    };
    note_version::Entity::find_by_id(version_id)
        .filter(note_version::Column::NoteId.eq(&note.id))
        .one(&state.db)
        .await
        .map_err(ApiError::from)
}

async fn note_version_response(
    state: &AppState,
    version: note_version::Model,
) -> Result<NoteVersionResponse, ApiError> {
    let created_by = user_summary(state, version.created_by_id.as_deref()).await?;
    Ok(NoteVersionResponse {
        id: version.id,
        note_id: version.note_id,
        body_sha256: version.body_sha256,
        parent_version_id: version.parent_version_id,
        commit_message: version.commit_message,
        created_by,
        created_at: version.created_at.to_rfc3339(),
    })
}

async fn folder_response(
    state: &AppState,
    folder: note_folder::Model,
) -> Result<FolderResponse, ApiError> {
    let created_by = user_summary(state, folder.created_by_id.as_deref()).await?;
    Ok(FolderResponse {
        id: folder.id,
        name: folder.name,
        visibility: folder.visibility,
        created_by,
        created_at: folder.created_at.to_rfc3339(),
        updated_at: folder.updated_at.to_rfc3339(),
        archived_at: folder.archived_at.map(|value| value.to_rfc3339()),
    })
}

async fn user_summary(state: &AppState, id: Option<&str>) -> Result<Option<UserSummary>, ApiError> {
    let Some(id) = id else {
        return Ok(None);
    };
    Ok(user::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .map(|u| UserSummary {
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image,
        }))
}

async fn resolved_mentions(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    note_id: &str,
) -> Result<Vec<ResolvedMention>, ApiError> {
    let rows = note_mention::Entity::find()
        .filter(note_mention::Column::NoteId.eq(note_id))
        .order_by_asc(note_mention::Column::CreatedAt)
        .all(&state.db)
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        match row.target_type.as_str() {
            "issue" => {
                if let Some(issue) = issue::Entity::find_by_id(&row.target_id)
                    .filter(issue::Column::OrganizationId.eq(organization_id))
                    .one(&state.db)
                    .await?
                {
                    out.push(ResolvedMention {
                        target_type: row.target_type,
                        target_id: row.target_id,
                        label: issue.title,
                        subtitle: Some(format!("Issue · {}", issue.status)),
                    });
                }
            }
            "chat" => {
                let has_access = chat_access::Entity::find()
                    .filter(chat_access::Column::ChatId.eq(&row.target_id))
                    .filter(chat_access::Column::UserId.eq(user_id))
                    .one(&state.db)
                    .await?
                    .is_some();
                if has_access {
                    if let Some(chat) = chat::Entity::find_by_id(&row.target_id)
                        .filter(chat::Column::OrganizationId.eq(organization_id))
                        .one(&state.db)
                        .await?
                    {
                        out.push(ResolvedMention {
                            target_type: row.target_type,
                            target_id: row.target_id,
                            label: chat.title,
                            subtitle: Some("Chat".to_owned()),
                        });
                    }
                }
            }
            "user" => {
                let is_member = member::Entity::find()
                    .filter(member::Column::OrganizationId.eq(organization_id))
                    .filter(member::Column::UserId.eq(&row.target_id))
                    .one(&state.db)
                    .await?
                    .is_some();
                if is_member {
                    if let Some(user) = user::Entity::find_by_id(&row.target_id)
                        .one(&state.db)
                        .await?
                    {
                        out.push(ResolvedMention {
                            target_type: row.target_type,
                            target_id: row.target_id,
                            label: user.name,
                            subtitle: Some(user.email),
                        });
                    }
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

async fn sync_mentions<C>(
    db: &C,
    note_id: &str,
    body_markdown: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<(), ApiError>
where
    C: sea_orm::ConnectionTrait,
{
    note_mention::Entity::delete_many()
        .filter(note_mention::Column::NoteId.eq(note_id))
        .exec(db)
        .await?;

    for mention in parse_mentions(body_markdown) {
        note_mention::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            note_id: Set(note_id.to_owned()),
            target_type: Set(mention.target_type),
            target_id: Set(mention.target_id),
            created_at: Set(now),
        }
        .insert(db)
        .await?;
    }

    Ok(())
}

#[derive(Hash, Eq, PartialEq)]
struct ParsedMention {
    target_type: String,
    target_id: String,
}

fn parse_mentions(markdown: &str) -> Vec<ParsedMention> {
    let Ok(pattern) = Regex::new(r"\[[^\]]+\]\(produktive://(issue|chat|user)/([^)]+)\)") else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for capture in pattern.captures_iter(markdown) {
        let target_type = capture.get(1).map(|m| m.as_str()).unwrap_or_default();
        let target_id = capture.get(2).map(|m| m.as_str()).unwrap_or_default();
        if target_id.is_empty() {
            continue;
        }
        let mention = ParsedMention {
            target_type: target_type.to_owned(),
            target_id: target_id.to_owned(),
        };
        if seen.insert((mention.target_type.clone(), mention.target_id.clone())) {
            out.push(mention);
        }
    }
    out
}

fn normalize_title(value: Option<&str>) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Untitled")
        .chars()
        .take(180)
        .collect()
}

fn normalize_folder_name(value: &str) -> Result<String, ApiError> {
    let name = value.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Folder name is required".to_owned()));
    }
    Ok(name.chars().take(120).collect())
}

fn normalize_visibility(value: Option<&str>) -> Result<String, ApiError> {
    match value.unwrap_or("workspace").trim() {
        "workspace" => Ok("workspace".to_owned()),
        "private" => Ok("private".to_owned()),
        _ => Err(ApiError::BadRequest(
            "Visibility must be workspace or private".to_owned(),
        )),
    }
}

fn visible_note_condition(user_id: &str) -> Condition {
    Condition::any()
        .add(note::Column::Visibility.eq("workspace"))
        .add(
            Condition::all()
                .add(note::Column::Visibility.eq("private"))
                .add(note::Column::CreatedById.eq(user_id)),
        )
}

fn visible_folder_condition(user_id: &str) -> Condition {
    Condition::any()
        .add(note_folder::Column::Visibility.eq("workspace"))
        .add(
            Condition::all()
                .add(note_folder::Column::Visibility.eq("private"))
                .add(note_folder::Column::CreatedById.eq(user_id)),
        )
}

async fn validate_folder(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    folder_id: Option<&str>,
) -> Result<Option<note_folder::Model>, ApiError> {
    let Some(folder_id) = folder_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let folder = find_folder(state, organization_id, user_id, folder_id).await?;
    Ok(Some(folder))
}

fn clean_search(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn note_edit_system_prompt() -> &'static str {
    "You are Produktive's note editing agent. Rewrite only the selected text according to the instruction. Return only the replacement Markdown, with no preface, no analysis, no code fence, and no surrounding quotes. Preserve useful Markdown structure when appropriate."
}

fn truncate_for_ai(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn clean_ai_replacement(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(inner) = trimmed
        .strip_prefix("```markdown")
        .or_else(|| trimmed.strip_prefix("```md"))
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|value| value.strip_suffix("```"))
    {
        return inner.trim().to_owned();
    }
    trimmed.to_owned()
}

#[cfg(test)]
mod tests {
    use super::parse_mentions;

    #[test]
    fn parse_mentions_extracts_supported_targets_once() {
        let mentions = parse_mentions(
            "See [@Bug](produktive://issue/i1), [@Chat](produktive://chat/c1), \
             [@Ada](produktive://user/u1), and [@Bug again](produktive://issue/i1).",
        );

        let pairs = mentions
            .into_iter()
            .map(|mention| (mention.target_type, mention.target_id))
            .collect::<Vec<_>>();

        assert_eq!(
            pairs,
            vec![
                ("issue".to_owned(), "i1".to_owned()),
                ("chat".to_owned(), "c1".to_owned()),
                ("user".to_owned(), "u1".to_owned()),
            ],
        );
    }
}
