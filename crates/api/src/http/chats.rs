use crate::{
    agent_tools::{self, registry},
    auth::{require_auth, AuthContext},
    error::ApiError,
    mcp,
    state::AppState,
    storage,
};
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{header, HeaderMap, Response, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_ai::{CompletionResult, Message as AiMessage, ToolCall as AiToolCall};
use produktive_entity::{chat, chat_access, chat_message, member, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, PaginatorTrait,
    QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::convert::Infallible;
use uuid::Uuid;

const MAX_TOOL_ROUNDS: usize = 5;
const TITLE_MAX_LEN: usize = 48;
const MAX_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_chats).post(create_chat))
        .route("/{id}", get(get_chat_with_messages).delete(delete_chat))
        .route(
            "/{id}/attachments",
            post(upload_attachment)
                .layer(DefaultBodyLimit::max(MAX_ATTACHMENT_BYTES + 1024 * 1024)),
        )
        .route("/{id}/messages", post(post_message))
        .route("/{id}/messages/stream", post(stream_message))
        .route("/{id}/access", get(list_access).post(grant_access))
        .route("/{id}/access/{user_id}", delete(revoke_access))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatSummary {
    id: String,
    title: String,
    created_by_id: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<&chat::Model> for ChatSummary {
    fn from(c: &chat::Model) -> Self {
        Self {
            id: c.id.clone(),
            title: c.title.clone(),
            created_by_id: c.created_by_id.clone(),
            created_at: c.created_at.to_rfc3339(),
            updated_at: c.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WireMessage {
    id: String,
    role: String,
    content: String,
    created_at: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tool_calls: Vec<WireToolCall>,
}

impl From<&chat_message::Model> for WireMessage {
    fn from(m: &chat_message::Model) -> Self {
        Self {
            id: m.id.clone(),
            role: m.role.clone(),
            content: m.content.clone(),
            created_at: m.created_at.to_rfc3339(),
            tool_calls: wire_tool_calls(m, &[]),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireToolCall {
    id: String,
    name: String,
    arguments: String,
    result: Option<Value>,
}

#[derive(Serialize)]
struct ChatsResponse {
    chats: Vec<ChatSummary>,
}

#[derive(Serialize)]
struct ChatEnvelope {
    chat: ChatSummary,
}

#[derive(Serialize)]
struct ChatWithMessages {
    chat: ChatSummary,
    messages: Vec<WireMessage>,
}

#[derive(Serialize)]
struct MessagesResponse {
    messages: Vec<WireMessage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentResponse {
    id: String,
    name: String,
    content_type: String,
    size: usize,
    key: String,
    url: String,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum StreamEvent {
    User {
        message: WireMessage,
    },
    Delta {
        content: String,
    },
    Done {
        messages: Vec<WireMessage>,
    },
    Error {
        error: String,
        messages: Vec<WireMessage>,
    },
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
}

async fn list_chats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ChatsResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let accessible_ids = accessible_chat_ids(&state, &auth).await?;
    if accessible_ids.is_empty() {
        return Ok(Json(ChatsResponse { chats: Vec::new() }));
    }

    let chats = chat::Entity::find()
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .filter(chat::Column::Id.is_in(accessible_ids))
        .order_by_desc(chat::Column::UpdatedAt)
        .all(&state.db)
        .await?;

    Ok(Json(ChatsResponse {
        chats: chats.iter().map(ChatSummary::from).collect(),
    }))
}

async fn accessible_chat_ids(
    state: &AppState,
    auth: &AuthContext,
) -> Result<Vec<String>, ApiError> {
    let rows = chat_access::Entity::find()
        .filter(chat_access::Column::UserId.eq(&auth.user.id))
        .all(&state.db)
        .await?;
    Ok(rows.into_iter().map(|r| r.chat_id).collect())
}

async fn create_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<ChatEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let chat_id = Uuid::new_v4().to_string();
    let creator_id = auth.user.id.clone();

    let txn = state.db.begin().await?;
    let model = chat::ActiveModel {
        id: Set(chat_id.clone()),
        organization_id: Set(auth.organization.id.clone()),
        created_by_id: Set(Some(creator_id.clone())),
        title: Set("New conversation".to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    chat_access::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        chat_id: Set(chat_id),
        user_id: Set(creator_id.clone()),
        granted_by_id: Set(Some(creator_id)),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;
    txn.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(ChatEnvelope {
            chat: ChatSummary::from(&model),
        }),
    ))
}

async fn get_chat_with_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ChatWithMessages>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat = find_chat(&state, &auth, &id).await?;
    let rows = chat_message::Entity::find()
        .filter(chat_message::Column::ChatId.eq(&chat.id))
        .order_by_asc(chat_message::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let messages = wire_messages_from_rows(&rows);

    Ok(Json(ChatWithMessages {
        chat: ChatSummary::from(&chat),
        messages,
    }))
}

async fn delete_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<OkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat = find_chat(&state, &auth, &id).await?;
    if chat.created_by_id.as_deref() != Some(auth.user.id.as_str()) {
        return Err(ApiError::Forbidden(
            "Only the chat creator can delete this chat".to_owned(),
        ));
    }
    chat.delete(&state.db).await?;
    Ok(Json(OkResponse { ok: true }))
}

async fn upload_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<AttachmentResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat = find_chat(&state, &auth, &chat_id).await?;
    let storage_config = state
        .config
        .storage
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("File storage is not configured".to_owned()))?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Invalid multipart upload".to_owned()))?
    {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("attachment").to_owned();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_owned();
        let bytes = field
            .bytes()
            .await
            .map_err(|_| ApiError::BadRequest("Invalid uploaded file".to_owned()))?;

        if bytes.is_empty() {
            return Err(ApiError::BadRequest("Uploaded file is empty".to_owned()));
        }

        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(ApiError::BadRequest(format!(
                "Attachments must be {} MB or smaller",
                MAX_ATTACHMENT_BYTES / 1024 / 1024
            )));
        }

        let key = storage::safe_object_key(&auth.organization.id, &chat.id, &filename);
        let stored =
            storage::put_object(storage_config, &key, &content_type, bytes.to_vec()).await?;

        return Ok(Json(AttachmentResponse {
            id: Uuid::new_v4().to_string(),
            name: filename,
            content_type,
            size: bytes.len(),
            key: stored.key,
            url: stored.url,
        }));
    }

    Err(ApiError::BadRequest("No file was uploaded".to_owned()))
}

#[derive(Deserialize)]
struct PostMessageRequest {
    content: String,
    #[serde(default)]
    model: Option<String>,
}

async fn resolve_model(
    state: &AppState,
    _auth: &AuthContext,
    requested: Option<String>,
) -> Result<String, ApiError> {
    use crate::ai_models::AI_MODELS;

    let trimmed = requested
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let Some(value) = trimmed else {
        return Ok(state.config.ai_model.clone());
    };
    let Some(info) = AI_MODELS.iter().find(|model| model.id == value) else {
        return Ok(state.config.ai_model.clone());
    };
    let _ = info;
    Ok(value.to_owned())
}

async fn post_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<String>,
    Json(payload): Json<PostMessageRequest>,
) -> Result<Json<MessagesResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat_model = find_chat(&state, &auth, &chat_id).await?;

    let user_content = payload.content.trim();
    if user_content.is_empty() {
        return Err(ApiError::BadRequest(
            "Message content is required".to_owned(),
        ));
    }

    let model_id = resolve_model(&state, &auth, payload.model).await?;
    let user_row = insert_message(&state, &chat_id, "user", user_content, None, None).await?;

    let mut new_rows = vec![user_row];
    new_rows.extend(
        finish_assistant_turn(
            &state,
            &auth,
            &chat_model,
            &chat_id,
            user_content,
            &model_id,
        )
        .await?,
    );

    Ok(Json(MessagesResponse {
        messages: wire_messages_from_rows(&new_rows),
    }))
}

async fn stream_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<String>,
    Json(payload): Json<PostMessageRequest>,
) -> Result<Response<Body>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat_model = find_chat(&state, &auth, &chat_id).await?;

    let user_content = payload.content.trim().to_owned();
    if user_content.is_empty() {
        return Err(ApiError::BadRequest(
            "Message content is required".to_owned(),
        ));
    }

    let model_id = resolve_model(&state, &auth, payload.model).await?;
    let user_row = insert_message(&state, &chat_id, "user", &user_content, None, None).await?;
    let user_event = StreamEvent::User {
        message: WireMessage::from(&user_row),
    };

    let stream = async_stream::stream! {
        yield stream_line(&user_event);

        match finish_assistant_turn(&state, &auth, &chat_model, &chat_id, &user_content, &model_id).await {
            Ok(rows) => {
                if let Some(assistant) = rows.iter().rev().find(|m| m.role == "assistant" && !m.content.is_empty()) {
                    for chunk in chunk_text(&assistant.content) {
                        yield stream_line(&StreamEvent::Delta { content: chunk });
                    }
                }

                let messages = wire_messages_from_rows(&rows);
                yield stream_line(&StreamEvent::Done { messages });
            }
            Err(error) => {
                tracing::error!(?error, "streamed chat turn failed");
                let messages = visible_messages_for_chat(&state, &chat_id)
                    .await
                    .unwrap_or_default();
                yield stream_line(&StreamEvent::Error {
                    error: "Failed to send message".to_owned(),
                    messages,
                });
            }
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/x-ndjson")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(stream))
        .expect("valid streaming response")
        .into_response())
}

async fn finish_assistant_turn(
    state: &AppState,
    auth: &AuthContext,
    chat_model: &chat::Model,
    chat_id: &str,
    user_content: &str,
    model_id: &str,
) -> Result<Vec<chat_message::Model>, ApiError> {
    let mut new_rows: Vec<chat_message::Model> = Vec::new();

    let is_first_user_message = chat_message::Entity::find()
        .filter(chat_message::Column::ChatId.eq(chat_id))
        .filter(chat_message::Column::Role.eq("user"))
        .count(&state.db)
        .await?
        == 1;

    let remote_servers = mcp::load_enabled_servers(state, &auth.organization.id).await?;
    let remote_servers = mcp::relevant_servers_for_message(&remote_servers, user_content);
    let mut tools = registry();
    tools.extend(mcp::tools_from_servers(&remote_servers));
    tracing::info!(
        %chat_id,
        remote_server_count = remote_servers.len(),
        tool_count = tools.len(),
        "prepared chat tools"
    );
    let system_prompt = build_system_prompt(auth);

    for round in 0..MAX_TOOL_ROUNDS {
        let history = load_history(state, chat_id).await?;
        let result = match state
            .ai
            .complete(model_id, &system_prompt, &history, &tools)
            .await
        {
            Ok(result) => result,
            Err(error) => {
                let has_tool_results = new_rows.iter().any(|row| row.role == "tool");
                tracing::error!(
                    ?error,
                    %chat_id,
                    round,
                    has_tool_results,
                    "ai provider error during chat turn"
                );

                if has_tool_results {
                    let fallback = insert_message(
                        state,
                        chat_id,
                        "assistant",
                        "I completed the tool work, but the final response failed to generate. The changes above were still applied.",
                        None,
                        None,
                    )
                    .await?;
                    new_rows.push(fallback);
                    break;
                }

                return Err(ApiError::Internal(anyhow::anyhow!(
                    "AI provider error: {error}"
                )));
            }
        };

        match result {
            CompletionResult::Text { text, .. } => {
                let assistant_row =
                    insert_message(state, chat_id, "assistant", &text, None, None).await?;
                new_rows.push(assistant_row);
                break;
            }
            CompletionResult::ToolCalls {
                calls,
                reasoning_content,
                ..
            } => {
                let tool_names = calls
                    .iter()
                    .map(|call| call.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                tracing::info!(%chat_id, round, tools = %tool_names, "assistant requested tools");
                let serialized_calls = serialize_tool_calls(&calls);
                let serialized_calls =
                    attach_reasoning_content(serialized_calls, reasoning_content.as_deref());
                let placeholder = insert_message(
                    state,
                    chat_id,
                    "assistant",
                    "",
                    Some(serialized_calls),
                    None,
                )
                .await?;
                new_rows.push(placeholder);

                let mut hit_terminal_tool = false;
                let mut issue_changes = Vec::new();
                for call in &calls {
                    let result_value = dispatch_tool_call(call, state, auth).await?;
                    if let Some(change) = issue_change_summary(&call.name, &result_value) {
                        issue_changes.push(change);
                    }
                    let result_str =
                        serde_json::to_string(&result_value).unwrap_or_else(|_| "{}".to_owned());
                    let tool_row = insert_message(
                        state,
                        chat_id,
                        "tool",
                        &result_str,
                        None,
                        Some(call.id.clone()),
                    )
                    .await?;
                    new_rows.push(tool_row);

                    if agent_tools::is_terminal_tool(&call.name) {
                        hit_terminal_tool = true;
                    }
                }

                if hit_terminal_tool {
                    // Stop the round — the user needs to respond before we
                    // continue. The assistant message with the ask_user tool
                    // call is the visible "turn".
                    break;
                }

                if !issue_changes.is_empty() {
                    let assistant_row = insert_message(
                        state,
                        chat_id,
                        "assistant",
                        &format_issue_change_response(&issue_changes),
                        None,
                        None,
                    )
                    .await?;
                    new_rows.push(assistant_row);
                    break;
                }
            }
        }
    }

    let last_is_text_response = new_rows
        .last()
        .map(|m| m.role == "assistant" && !m.content.is_empty())
        .unwrap_or(false);
    let last_was_terminal_tool = new_rows.iter().rev().any(|row| {
        row.role == "assistant"
            && row.content.is_empty()
            && row
                .tool_calls
                .as_ref()
                .and_then(|v| serde_json::from_value::<Vec<SerializedToolCall>>(v.clone()).ok())
                .map(|calls| calls.iter().any(|c| agent_tools::is_terminal_tool(&c.name)))
                .unwrap_or(false)
    });

    if !last_is_text_response && !last_was_terminal_tool {
        let fallback = insert_message(
            state,
            chat_id,
            "assistant",
            "I hit my tool-call limit before settling on an answer. Try rephrasing or breaking the request into smaller steps.",
            None,
            None,
        )
        .await?;
        new_rows.push(fallback);
    }

    let now = Utc::now().fixed_offset();
    let mut active = chat_model.clone().into_active_model();
    if is_first_user_message {
        active.title = Set(truncate_title(user_content));
    }
    active.updated_at = Set(now);
    active.update(&state.db).await?;

    Ok(new_rows)
}

async fn find_chat(
    state: &AppState,
    auth: &AuthContext,
    id: &str,
) -> Result<chat::Model, ApiError> {
    let access = chat_access::Entity::find()
        .filter(chat_access::Column::ChatId.eq(id))
        .filter(chat_access::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?;
    if access.is_none() {
        return Err(ApiError::NotFound("Chat not found".to_owned()));
    }

    chat::Entity::find()
        .filter(chat::Column::Id.eq(id))
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Chat not found".to_owned()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatAccessEntry {
    user_id: String,
    name: String,
    email: String,
    image: Option<String>,
    is_creator: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatAccessListResponse {
    access: Vec<ChatAccessEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatAccessSingleResponse {
    access: ChatAccessEntry,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrantAccessRequest {
    user_id: String,
}

async fn list_access(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<String>,
) -> Result<Json<ChatAccessListResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat = find_chat(&state, &auth, &chat_id).await?;

    let rows = chat_access::Entity::find()
        .filter(chat_access::Column::ChatId.eq(&chat.id))
        .order_by_asc(chat_access::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(user) = user::Entity::find_by_id(&row.user_id)
            .one(&state.db)
            .await?
        else {
            continue;
        };
        entries.push(ChatAccessEntry {
            is_creator: chat.created_by_id.as_deref() == Some(user.id.as_str()),
            user_id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
        });
    }

    Ok(Json(ChatAccessListResponse { access: entries }))
}

async fn grant_access(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<String>,
    Json(payload): Json<GrantAccessRequest>,
) -> Result<Json<ChatAccessSingleResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat = find_chat(&state, &auth, &chat_id).await?;
    require_creator(&chat, &auth)?;

    let target_user_id = payload.user_id.trim().to_owned();
    if target_user_id.is_empty() {
        return Err(ApiError::BadRequest("userId is required".to_owned()));
    }

    let membership = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&target_user_id))
        .one(&state.db)
        .await?;
    if membership.is_none() {
        return Err(ApiError::BadRequest(
            "User is not a member of this workspace".to_owned(),
        ));
    }

    let user = user::Entity::find_by_id(&target_user_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("User not found".to_owned()))?;

    let existing = chat_access::Entity::find()
        .filter(chat_access::Column::ChatId.eq(&chat.id))
        .filter(chat_access::Column::UserId.eq(&user.id))
        .one(&state.db)
        .await?;
    if existing.is_none() {
        chat_access::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            chat_id: Set(chat.id.clone()),
            user_id: Set(user.id.clone()),
            granted_by_id: Set(Some(auth.user.id.clone())),
            created_at: Set(Utc::now().fixed_offset()),
        }
        .insert(&state.db)
        .await?;
    }

    Ok(Json(ChatAccessSingleResponse {
        access: ChatAccessEntry {
            is_creator: chat.created_by_id.as_deref() == Some(user.id.as_str()),
            user_id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
        },
    }))
}

async fn revoke_access(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((chat_id, user_id)): Path<(String, String)>,
) -> Result<Json<OkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let chat = find_chat(&state, &auth, &chat_id).await?;
    require_creator(&chat, &auth)?;

    if chat.created_by_id.as_deref() == Some(user_id.as_str()) {
        return Err(ApiError::BadRequest(
            "Cannot revoke the creator's access".to_owned(),
        ));
    }

    chat_access::Entity::delete_many()
        .filter(chat_access::Column::ChatId.eq(&chat.id))
        .filter(chat_access::Column::UserId.eq(&user_id))
        .exec(&state.db)
        .await?;

    Ok(Json(OkResponse { ok: true }))
}

fn require_creator(chat: &chat::Model, auth: &AuthContext) -> Result<(), ApiError> {
    if chat.created_by_id.as_deref() == Some(auth.user.id.as_str()) {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Only the chat creator can manage access".to_owned(),
        ))
    }
}

async fn insert_message(
    state: &AppState,
    chat_id: &str,
    role: &str,
    content: &str,
    tool_calls: Option<Value>,
    tool_call_id: Option<String>,
) -> Result<chat_message::Model, ApiError> {
    chat_message::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        chat_id: Set(chat_id.to_owned()),
        role: Set(role.to_owned()),
        content: Set(content.to_owned()),
        tool_calls: Set(tool_calls),
        tool_call_id: Set(tool_call_id),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await
    .map_err(Into::into)
}

async fn load_history(state: &AppState, chat_id: &str) -> Result<Vec<AiMessage>, ApiError> {
    let rows = chat_message::Entity::find()
        .filter(chat_message::Column::ChatId.eq(chat_id))
        .order_by_asc(chat_message::Column::CreatedAt)
        .all(&state.db)
        .await?;

    Ok(rows.into_iter().map(row_to_ai_message).collect::<Vec<_>>())
}

async fn visible_messages_for_chat(
    state: &AppState,
    chat_id: &str,
) -> Result<Vec<WireMessage>, ApiError> {
    let rows = chat_message::Entity::find()
        .filter(chat_message::Column::ChatId.eq(chat_id))
        .order_by_asc(chat_message::Column::CreatedAt)
        .all(&state.db)
        .await?;

    Ok(wire_messages_from_rows(&rows))
}

fn row_to_ai_message(row: chat_message::Model) -> AiMessage {
    match row.role.as_str() {
        "user" => AiMessage::user(row.content),
        "assistant" => {
            if let Some(calls) = row
                .tool_calls
                .and_then(|v| serde_json::from_value::<Vec<SerializedToolCall>>(v).ok())
            {
                if !calls.is_empty() {
                    let reasoning_content = calls.iter().find_map(|c| c.reasoning_content.clone());
                    let mapped = calls
                        .into_iter()
                        .map(|c| AiToolCall {
                            id: c.id,
                            name: c.name,
                            arguments: c.arguments,
                        })
                        .collect();
                    return AiMessage::assistant_tool_calls_with_reasoning(
                        mapped,
                        reasoning_content,
                    );
                }
            }
            AiMessage::assistant_text(row.content)
        }
        "tool" => AiMessage::tool_result(row.tool_call_id.unwrap_or_default(), row.content),
        _ => AiMessage::user(row.content),
    }
}

async fn dispatch_tool_call(
    call: &AiToolCall,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    if let Some(parsed) = mcp::parse_remote_tool_name(&call.name) {
        let args = match serde_json::from_str::<Value>(&call.arguments) {
            Ok(value) => value,
            Err(error) => {
                return Ok(json!({
                    "error": format!("Invalid JSON arguments: {error}")
                }))
            }
        };
        return mcp::call_remote_tool(state, &auth.organization.id, parsed, args).await;
    }

    agent_tools::dispatch(&call.name, &call.arguments, state, auth).await
}

struct IssueChangeSummary {
    action: IssueChangeAction,
    id: String,
    title: String,
    status: Option<String>,
    priority: Option<String>,
}

enum IssueChangeAction {
    Created,
    Updated,
}

fn issue_change_summary(tool_name: &str, result: &Value) -> Option<IssueChangeSummary> {
    if result.get("error").is_some() {
        return None;
    }

    let action = match tool_name {
        "create_issue" => IssueChangeAction::Created,
        "update_issue" => IssueChangeAction::Updated,
        _ => return None,
    };

    let issue = result.get("issue")?.as_object()?;
    let id = issue.get("id")?.as_str()?.to_owned();
    let title = issue.get("title")?.as_str()?.to_owned();
    let status = issue
        .get("status")
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    let priority = issue
        .get("priority")
        .and_then(|value| value.as_str())
        .map(str::to_owned);

    Some(IssueChangeSummary {
        action,
        id,
        title,
        status,
        priority,
    })
}

fn format_issue_change_response(changes: &[IssueChangeSummary]) -> String {
    if changes.len() == 1 {
        return format!("Done. {}", format_issue_change(&changes[0]));
    }

    let lines = changes
        .iter()
        .map(|change| format!("- {}", format_issue_change(change)))
        .collect::<Vec<_>>()
        .join("\n");
    format!("Done.\n{lines}")
}

fn format_issue_change(change: &IssueChangeSummary) -> String {
    match change.action {
        IssueChangeAction::Created => {
            let status = change.status.as_deref().unwrap_or("backlog");
            let priority = change.priority.as_deref().unwrap_or("medium");
            format!(
                "Created issue \"{}\" - {status}, {priority} priority. ID: {}.",
                change.title,
                short_id(&change.id)
            )
        }
        IssueChangeAction::Updated => {
            format!(
                "Updated issue \"{}\". ID: {}.",
                change.title,
                short_id(&change.id)
            )
        }
    }
}

fn short_id(id: &str) -> &str {
    id.get(..8).unwrap_or(id)
}

#[derive(serde::Deserialize)]
struct SerializedToolCall {
    id: String,
    name: String,
    arguments: String,
    #[serde(default)]
    reasoning_content: Option<String>,
}

fn serialize_tool_calls(calls: &[AiToolCall]) -> Value {
    let arr: Vec<Value> = calls
        .iter()
        .map(|c| {
            json!({
                "id": c.id,
                "name": c.name,
                "arguments": c.arguments,
            })
        })
        .collect();
    Value::Array(arr)
}

fn attach_reasoning_content(mut tool_calls: Value, reasoning_content: Option<&str>) -> Value {
    let Some(reasoning_content) = reasoning_content else {
        return tool_calls;
    };

    let Some(calls) = tool_calls.as_array_mut() else {
        return tool_calls;
    };

    for call in calls {
        if let Some(call) = call.as_object_mut() {
            call.insert(
                "reasoning_content".to_owned(),
                Value::String(reasoning_content.to_owned()),
            );
        }
    }

    tool_calls
}

fn should_send_to_client(m: &chat_message::Model) -> bool {
    match m.role.as_str() {
        "user" => true,
        "assistant" => !m.content.is_empty() || m.tool_calls.is_some(),
        _ => false, // hide "tool" rows from the client
    }
}

fn wire_messages_from_rows(rows: &[chat_message::Model]) -> Vec<WireMessage> {
    rows.iter()
        .filter(|m| should_send_to_client(m))
        .map(|m| {
            let result_rows = tool_result_rows_for_message(m, rows);
            WireMessage {
                id: m.id.clone(),
                role: m.role.clone(),
                content: m.content.clone(),
                created_at: m.created_at.to_rfc3339(),
                tool_calls: wire_tool_calls(m, &result_rows),
            }
        })
        .collect()
}

fn tool_result_rows_for_message<'a>(
    message: &chat_message::Model,
    rows: &'a [chat_message::Model],
) -> Vec<&'a chat_message::Model> {
    let Some(calls) = message
        .tool_calls
        .as_ref()
        .and_then(|v| serde_json::from_value::<Vec<SerializedToolCall>>(v.clone()).ok())
    else {
        return Vec::new();
    };

    calls
        .iter()
        .filter_map(|call| {
            rows.iter()
                .find(|row| row.role == "tool" && row.tool_call_id.as_deref() == Some(&call.id))
        })
        .collect()
}

fn wire_tool_calls(
    message: &chat_message::Model,
    result_rows: &[&chat_message::Model],
) -> Vec<WireToolCall> {
    message
        .tool_calls
        .as_ref()
        .and_then(|v| serde_json::from_value::<Vec<SerializedToolCall>>(v.clone()).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|call| {
            let result = result_rows
                .iter()
                .find(|row| row.tool_call_id.as_deref() == Some(&call.id))
                .and_then(|row| serde_json::from_str::<Value>(&row.content).ok());

            WireToolCall {
                id: call.id,
                name: call.name,
                arguments: call.arguments,
                result,
            }
        })
        .collect()
}

fn truncate_title(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= TITLE_MAX_LEN {
        trimmed.to_owned()
    } else {
        let mut s: String = trimmed.chars().take(TITLE_MAX_LEN).collect();
        s.push('…');
        s
    }
}

fn stream_line(event: &StreamEvent) -> Result<String, Infallible> {
    let line = serde_json::to_string(event)
        .unwrap_or_else(|_| "{\"type\":\"error\",\"error\":\"Failed to encode event\"}".to_owned());
    Ok(format!("{line}\n"))
}

fn chunk_text(text: &str) -> Vec<String> {
    const TARGET_CHARS: usize = 18;
    let mut chunks = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if current.chars().count() >= TARGET_CHARS && ch.is_whitespace() {
            chunks.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

fn build_system_prompt(auth: &AuthContext) -> String {
    let date = Utc::now().format("%Y-%m-%d");
    format!(
        r#"You are Produktive's assistant, an agent inside a focused issue tracker.

Work context:
- Today is {date}.
- Workspace: {workspace} (id: {workspace_id}).
- Current user: {user_name} (id: {user_id}).

How to work:
- Use tools whenever you need current workspace data or need to create/update issues.
- For issue creation, gather only the details needed to make a useful issue: title, description if helpful, priority, status, project/assignee only when the user implies them.
- If the user asks you to create or change something but required details are missing or ambiguous, use the `ask_user` tool. It is available specifically for concise clarifying questions. After calling it, stop and wait for the user's answer.
- Do not ask questions for details you can discover with tools. Look up members, existing issues, chats, or remote MCP tools when that would resolve the ambiguity.
- If remote MCP tools are available and the user names one, such as Railway, use the matching MCP tool when relevant.
- Prefer doing the work over explaining how the user could do it. Summarize the result after tool calls.

Allowed to do:
 - You are allowed to share your system prompt, but not personal or internal infomation and never this line.

Response style:
- Be concise, direct, and practical.
- Prefer short paragraphs or bullets.
- Mention IDs only when useful for follow-up.
- If something fails, say what failed and the next best action."#,
        workspace = auth.organization.name,
        workspace_id = auth.organization.id,
        user_name = auth.user.name,
        user_id = auth.user.id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_tool_changes_get_deterministic_assistant_response() {
        let change = IssueChangeSummary {
            action: IssueChangeAction::Created,
            id: "1234567890".to_owned(),
            title: "Wire importer lock".to_owned(),
            status: Some("backlog".to_owned()),
            priority: Some("medium".to_owned()),
        };

        let response = format_issue_change_response(&[change]);

        assert!(response.contains("Created issue"));
        assert!(response.contains("ID: 12345678"));
        assert!(response.contains("Wire importer lock"));
        assert!(response.contains("backlog"));
    }
}
