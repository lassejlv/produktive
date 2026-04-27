use crate::{
    agent_tools::{self, registry},
    auth::{require_auth, AuthContext},
    error::ApiError,
    state::AppState,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, Response, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_ai::{CompletionResult, Message as AiMessage, ToolCall as AiToolCall};
use produktive_entity::{chat, chat_message};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, PaginatorTrait,
    QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::convert::Infallible;
use uuid::Uuid;

const MAX_TOOL_ROUNDS: usize = 5;
const TITLE_MAX_LEN: usize = 48;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_chats).post(create_chat))
        .route("/{id}", get(get_chat_with_messages).delete(delete_chat))
        .route("/{id}/messages", post(post_message))
        .route("/{id}/messages/stream", post(stream_message))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatSummary {
    id: String,
    title: String,
    created_at: String,
    updated_at: String,
}

impl From<&chat::Model> for ChatSummary {
    fn from(c: &chat::Model) -> Self {
        Self {
            id: c.id.clone(),
            title: c.title.clone(),
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
}

impl From<&chat_message::Model> for WireMessage {
    fn from(m: &chat_message::Model) -> Self {
        Self {
            id: m.id.clone(),
            role: m.role.clone(),
            content: m.content.clone(),
            created_at: m.created_at.to_rfc3339(),
        }
    }
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
#[serde(tag = "type", rename_all = "camelCase")]
enum StreamEvent {
    User { message: WireMessage },
    Delta { content: String },
    Done { messages: Vec<WireMessage> },
    Error { error: String },
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
    let chats = chat::Entity::find()
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_desc(chat::Column::UpdatedAt)
        .all(&state.db)
        .await?;

    Ok(Json(ChatsResponse {
        chats: chats.iter().map(ChatSummary::from).collect(),
    }))
}

async fn create_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<ChatEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let now = Utc::now().fixed_offset();

    let model = chat::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        created_by_id: Set(Some(auth.user.id.clone())),
        title: Set("New conversation".to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

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

    let messages = rows
        .iter()
        .filter(|m| should_send_to_client(m))
        .map(WireMessage::from)
        .collect();

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
    chat.delete(&state.db).await?;
    Ok(Json(OkResponse { ok: true }))
}

#[derive(Deserialize)]
struct PostMessageRequest {
    content: String,
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

    let user_row = insert_message(&state, &chat_id, "user", user_content, None, None).await?;

    let mut new_rows = vec![user_row];
    new_rows
        .extend(finish_assistant_turn(&state, &auth, &chat_model, &chat_id, user_content).await?);

    Ok(Json(MessagesResponse {
        messages: new_rows
            .iter()
            .filter(|m| should_send_to_client(m))
            .map(WireMessage::from)
            .collect(),
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

    let user_row = insert_message(&state, &chat_id, "user", &user_content, None, None).await?;
    let user_event = StreamEvent::User {
        message: WireMessage::from(&user_row),
    };

    let stream = async_stream::stream! {
        yield stream_line(&user_event);

        match finish_assistant_turn(&state, &auth, &chat_model, &chat_id, &user_content).await {
            Ok(rows) => {
                if let Some(assistant) = rows.iter().rev().find(|m| m.role == "assistant" && !m.content.is_empty()) {
                    for chunk in chunk_text(&assistant.content) {
                        yield stream_line(&StreamEvent::Delta { content: chunk });
                    }
                }

                let messages = rows
                    .iter()
                    .filter(|m| should_send_to_client(m))
                    .map(WireMessage::from)
                    .collect();
                yield stream_line(&StreamEvent::Done { messages });
            }
            Err(error) => {
                tracing::error!(?error, "streamed chat turn failed");
                yield stream_line(&StreamEvent::Error {
                    error: "Failed to send message".to_owned(),
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
) -> Result<Vec<chat_message::Model>, ApiError> {
    let mut new_rows: Vec<chat_message::Model> = Vec::new();

    let is_first_user_message = chat_message::Entity::find()
        .filter(chat_message::Column::ChatId.eq(chat_id))
        .filter(chat_message::Column::Role.eq("user"))
        .count(&state.db)
        .await?
        == 1;

    let tools = registry();
    let system_prompt = build_system_prompt(auth);

    for _ in 0..MAX_TOOL_ROUNDS {
        let history = load_history(state, chat_id).await?;
        let result = state
            .ai
            .complete(&state.config.ai_model, &system_prompt, &history, &tools)
            .await
            .map_err(|e| {
                tracing::error!(?e, "ai provider error");
                ApiError::Internal(anyhow::anyhow!("AI provider error: {e}"))
            })?;

        match result {
            CompletionResult::Text(text) => {
                let assistant_row =
                    insert_message(state, chat_id, "assistant", &text, None, None).await?;
                new_rows.push(assistant_row);
                break;
            }
            CompletionResult::ToolCalls(calls) => {
                let serialized_calls = serialize_tool_calls(&calls);
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

                for call in &calls {
                    let result_value =
                        agent_tools::dispatch(&call.name, &call.arguments, state, auth).await?;
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
                }
            }
        }
    }

    if !new_rows
        .last()
        .map(|m| m.role == "assistant" && !m.content.is_empty())
        .unwrap_or(false)
    {
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
    chat::Entity::find()
        .filter(chat::Column::Id.eq(id))
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Chat not found".to_owned()))
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

fn row_to_ai_message(row: chat_message::Model) -> AiMessage {
    match row.role.as_str() {
        "user" => AiMessage::user(row.content),
        "assistant" => {
            if let Some(calls) = row
                .tool_calls
                .and_then(|v| serde_json::from_value::<Vec<SerializedToolCall>>(v).ok())
            {
                if !calls.is_empty() {
                    let mapped = calls
                        .into_iter()
                        .map(|c| AiToolCall {
                            id: c.id,
                            name: c.name,
                            arguments: c.arguments,
                        })
                        .collect();
                    return AiMessage::assistant_tool_calls(mapped);
                }
            }
            AiMessage::assistant_text(row.content)
        }
        "tool" => AiMessage::tool_result(row.tool_call_id.unwrap_or_default(), row.content),
        _ => AiMessage::user(row.content),
    }
}

#[derive(serde::Deserialize)]
struct SerializedToolCall {
    id: String,
    name: String,
    arguments: String,
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

fn should_send_to_client(m: &chat_message::Model) -> bool {
    match m.role.as_str() {
        "user" => true,
        "assistant" => !m.content.is_empty(),
        _ => false, // hide "tool" rows from the client
    }
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
        "You are Produktive's assistant — a helpful agent inside an issue tracker. Use tools to read or modify the workspace's issues. Be concise. Prefer bullet points and short paragraphs. Today is {date}. Workspace: {workspace} (id: {workspace_id}). Current user: {user_name} (id: {user_id}).",
        workspace = auth.organization.name,
        workspace_id = auth.organization.id,
        user_name = auth.user.name,
        user_id = auth.user.id,
    )
}
