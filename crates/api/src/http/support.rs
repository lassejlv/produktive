use crate::{
    auth::require_platform_admin,
    error::ApiError,
    state::AppState,
    storage::{put_object, safe_support_raw_email_key},
};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use mail_parser::MessageParser;
use produktive_entity::{support_message, support_ticket, support_ticket_event, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, EntityTrait, IntoActiveModel, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

const DEFAULT_LIMIT: u64 = 30;
const MAX_LIMIT: u64 = 100;
const VALID_STATUSES: &[&str] = &["open", "pending", "closed"];
const VALID_PRIORITIES: &[&str] = &["normal", "high", "urgent"];

pub fn routes() -> Router<AppState> {
    Router::new().route("/email/inbound", post(ingest_inbound_email))
}

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/tickets", get(list_tickets))
        .route("/tickets/{id}", get(get_ticket).patch(update_ticket))
        .route("/tickets/{id}/reply", post(reply_to_ticket))
        .route("/messages/{id}/retry", post(retry_support_message))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InboundEmailPayload {
    envelope_from: String,
    envelope_to: String,
    raw_base64: String,
    raw_size: Option<u64>,
    headers: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InboundEmailResponse {
    ticket_id: String,
    ticket_number: String,
    message_id: String,
    created_ticket: bool,
}

async fn ingest_inbound_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<InboundEmailPayload>,
) -> Result<Json<InboundEmailResponse>, ApiError> {
    require_worker_secret(&state, &headers)?;

    let raw = BASE64
        .decode(payload.raw_base64.trim())
        .map_err(|_| ApiError::BadRequest("rawBase64 was not valid base64".to_owned()))?;
    if let Some(raw_size) = payload.raw_size {
        if raw_size as usize != raw.len() {
            tracing::warn!(
                declared = raw_size,
                actual = raw.len(),
                "support email raw size mismatch"
            );
        }
    }

    let parsed = parse_email(&raw, &payload.envelope_from, &payload.envelope_to)?;
    if let Some(existing) = find_existing_message(&state, parsed.message_id.as_deref()).await? {
        let ticket = support_ticket::Entity::find_by_id(existing.ticket_id.clone())
            .one(&state.db)
            .await?
            .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
        return Ok(Json(InboundEmailResponse {
            ticket_id: ticket.id,
            ticket_number: ticket.number,
            message_id: existing.id,
            created_ticket: false,
        }));
    }

    let now = Utc::now().fixed_offset();
    let matched_ticket = find_thread_ticket(&state, &parsed.thread_ids).await?;
    let created_ticket = matched_ticket.is_none();
    let ticket = match matched_ticket {
        Some(ticket) => ticket,
        None => {
            let id = Uuid::new_v4().to_string();
            support_ticket::ActiveModel {
                id: Set(id.clone()),
                number: Set(format!("SUP-{}", short_id(&id))),
                subject: Set(parsed.subject.clone()),
                status: Set("open".to_owned()),
                priority: Set("normal".to_owned()),
                customer_email: Set(parsed.from_email.clone()),
                customer_name: Set(parsed.from_name.clone()),
                assigned_admin_id: Set(None),
                last_message_at: Set(now),
                closed_at: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(&state.db)
            .await?
        }
    };

    let message_id = Uuid::new_v4().to_string();
    let raw_object_key = if let Some(storage) = &state.config.storage {
        match put_object(
            storage,
            &safe_support_raw_email_key(&ticket.id, &message_id),
            "message/rfc822",
            raw.clone(),
        )
        .await
        {
            Ok(object) => Some(object.key),
            Err(error) => {
                tracing::warn!(%error, ticket_id = %ticket.id, "failed to store raw support email");
                None
            }
        }
    } else {
        None
    };

    let message = support_message::ActiveModel {
        id: Set(message_id.clone()),
        ticket_id: Set(ticket.id.clone()),
        direction: Set("inbound".to_owned()),
        from_email: Set(parsed.from_email),
        to_email: Set(payload.envelope_to),
        cc: Set(json!(parsed.cc)),
        subject: Set(parsed.subject.clone()),
        body_text: Set(parsed.body_text),
        body_html: Set(parsed.body_html),
        message_id: Set(parsed.message_id),
        in_reply_to: Set(parsed.in_reply_to),
        references: Set(parsed.references),
        raw_object_key: Set(raw_object_key),
        sent_by_admin_id: Set(None),
        delivery_status: Set("received".to_owned()),
        delivery_provider_id: Set(None),
        delivery_error: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    let mut active_ticket = ticket.clone().into_active_model();
    active_ticket.last_message_at = Set(now);
    active_ticket.updated_at = Set(now);
    if ticket.status == "closed" {
        active_ticket.status = Set("open".to_owned());
        active_ticket.closed_at = Set(None);
    }
    active_ticket.update(&state.db).await?;

    insert_event(
        &state,
        &ticket.id,
        None,
        if created_ticket {
            "ticket_created"
        } else {
            "inbound_reply"
        },
        json!({
            "messageId": message.id,
            "headers": payload.headers.unwrap_or_else(|| json!({})),
        }),
    )
    .await?;

    if created_ticket {
        if let Err(error) = send_new_ticket_auto_reply(&state, &ticket).await {
            tracing::warn!(
                %error,
                ticket_id = %ticket.id,
                "failed to create support auto-reply"
            );
        }
    }

    Ok(Json(InboundEmailResponse {
        ticket_id: ticket.id,
        ticket_number: ticket.number,
        message_id: message.id,
        created_ticket,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TicketListQuery {
    status: Option<String>,
    search: Option<String>,
    page: Option<u64>,
    limit: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    page: u64,
    limit: u64,
    total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TicketsResponse {
    tickets: Vec<TicketSummary>,
    page: PageInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TicketSummary {
    id: String,
    number: String,
    subject: String,
    status: String,
    priority: String,
    customer_email: String,
    customer_name: Option<String>,
    assigned_admin_id: Option<String>,
    last_message_at: String,
    closed_at: Option<String>,
    created_at: String,
    updated_at: String,
    message_count: u64,
}

async fn list_tickets(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TicketListQuery>,
) -> Result<Json<TicketsResponse>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let (page, limit, offset) = pagination(query.page, query.limit);
    let condition = ticket_condition(&query);
    let total = support_ticket::Entity::find()
        .filter(condition.clone())
        .count(&state.db)
        .await?;
    let rows = support_ticket::Entity::find()
        .filter(condition)
        .order_by_desc(support_ticket::Column::LastMessageAt)
        .limit(limit)
        .offset(offset)
        .all(&state.db)
        .await?;

    let mut tickets = Vec::with_capacity(rows.len());
    for row in rows {
        tickets.push(ticket_summary(&state, row).await?);
    }

    Ok(Json(TicketsResponse {
        tickets,
        page: PageInfo { page, limit, total },
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TicketDetail {
    ticket: TicketSummary,
    messages: Vec<MessageWire>,
    events: Vec<EventWire>,
    assigned_admin: Option<AdminWire>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageWire {
    id: String,
    direction: String,
    from_email: String,
    to_email: String,
    cc: Vec<String>,
    subject: String,
    body_text: Option<String>,
    body_html: Option<String>,
    message_id: Option<String>,
    in_reply_to: Option<String>,
    references: Option<String>,
    delivery_status: String,
    delivery_provider_id: Option<String>,
    delivery_error: Option<String>,
    sent_by_admin_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventWire {
    id: String,
    event_type: String,
    metadata: Value,
    actor_admin_id: Option<String>,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminWire {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
}

async fn get_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TicketDetail>, ApiError> {
    require_platform_admin(&headers, &state).await?;
    let ticket = support_ticket::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
    Ok(Json(ticket_detail(&state, ticket).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTicketPayload {
    status: Option<String>,
    priority: Option<String>,
    assigned_admin_id: Option<String>,
}

async fn update_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTicketPayload>,
) -> Result<Json<TicketDetail>, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    let ticket = support_ticket::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
    let now = Utc::now().fixed_offset();
    let mut active = ticket.into_active_model();
    let mut metadata = json!({});

    if let Some(status) = payload.status {
        let status = validate_choice(status, VALID_STATUSES, "status")?;
        active.status = Set(status.clone());
        active.closed_at = Set(if status == "closed" { Some(now) } else { None });
        metadata["status"] = json!(status);
    }
    if let Some(priority) = payload.priority {
        let priority = validate_choice(priority, VALID_PRIORITIES, "priority")?;
        active.priority = Set(priority.clone());
        metadata["priority"] = json!(priority);
    }
    if payload.assigned_admin_id.is_some() {
        let assigned_admin_id = payload
            .assigned_admin_id
            .and_then(|value| (!value.trim().is_empty()).then(|| value.trim().to_owned()));
        if let Some(admin_id) = &assigned_admin_id {
            let exists = user::Entity::find_by_id(admin_id.clone())
                .one(&state.db)
                .await?
                .is_some();
            if !exists {
                return Err(ApiError::BadRequest(
                    "Assigned admin does not exist".to_owned(),
                ));
            }
        }
        active.assigned_admin_id = Set(assigned_admin_id.clone());
        metadata["assignedAdminId"] = json!(assigned_admin_id);
    }
    active.updated_at = Set(now);
    let updated = active.update(&state.db).await?;
    insert_event(
        &state,
        &updated.id,
        Some(&admin.user.id),
        "ticket_updated",
        metadata,
    )
    .await?;
    Ok(Json(ticket_detail(&state, updated).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplyPayload {
    body_text: String,
    close_after_reply: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplyResponse {
    ticket: TicketDetail,
    message: MessageWire,
}

async fn reply_to_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<ReplyPayload>,
) -> Result<Json<ReplyResponse>, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    let ticket = support_ticket::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
    let body_text = payload.body_text.trim();
    if body_text.is_empty() {
        return Err(ApiError::BadRequest("Reply body is required".to_owned()));
    }

    let reply = create_pending_reply(&state, &ticket, &admin.user.id, body_text).await?;
    let sent = send_support_reply(&state, &ticket, &reply).await;
    let updated_message = update_delivery_result(&state, reply, sent).await?;
    if payload.close_after_reply.unwrap_or(false) && updated_message.delivery_status == "sent" {
        close_ticket_after_reply(&state, &ticket.id, &admin.user.id).await?;
    }
    insert_event(
        &state,
        &ticket.id,
        Some(&admin.user.id),
        "admin_reply",
        json!({
            "messageId": updated_message.id,
            "deliveryStatus": updated_message.delivery_status,
            "deliveryError": updated_message.delivery_error,
        }),
    )
    .await?;
    let detail_ticket = support_ticket::Entity::find_by_id(ticket.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
    Ok(Json(ReplyResponse {
        ticket: ticket_detail(&state, detail_ticket).await?,
        message: message_wire(updated_message),
    }))
}

async fn retry_support_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<TicketDetail>, ApiError> {
    let admin = require_platform_admin(&headers, &state).await?;
    let message = support_message::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support message not found".to_owned()))?;
    if message.direction != "outbound" {
        return Err(ApiError::BadRequest(
            "Only outbound messages can be retried".to_owned(),
        ));
    }
    let ticket = support_ticket::Entity::find_by_id(message.ticket_id.clone())
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
    let sent = send_support_reply(&state, &ticket, &message).await;
    let updated = update_delivery_result(&state, message, sent).await?;
    insert_event(
        &state,
        &ticket.id,
        Some(&admin.user.id),
        "reply_retry",
        json!({
            "messageId": updated.id,
            "deliveryStatus": updated.delivery_status,
            "deliveryError": updated.delivery_error,
        }),
    )
    .await?;
    Ok(Json(ticket_detail(&state, ticket).await?))
}

#[derive(Debug)]
struct ParsedEmail {
    from_email: String,
    from_name: Option<String>,
    cc: Vec<String>,
    subject: String,
    body_text: Option<String>,
    body_html: Option<String>,
    message_id: Option<String>,
    in_reply_to: Option<String>,
    references: Option<String>,
    thread_ids: Vec<String>,
}

fn parse_email(
    raw: &[u8],
    envelope_from: &str,
    _envelope_to: &str,
) -> Result<ParsedEmail, ApiError> {
    let parser = MessageParser::new()
        .with_minimal_headers()
        .with_message_ids();
    let message = parser
        .parse(raw)
        .ok_or_else(|| ApiError::BadRequest("Email could not be parsed".to_owned()))?;
    let from = message.from().and_then(|address| address.first());
    let from_email = from
        .and_then(|addr| addr.address.as_ref().map(|value| value.to_string()))
        .unwrap_or_else(|| envelope_from.to_owned());
    let from_name = from.and_then(|addr| addr.name.as_ref().map(|value| value.to_string()));
    let cc = message
        .cc()
        .map(|address| {
            address
                .iter()
                .filter_map(|addr| addr.address.as_ref().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let subject = message
        .subject()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("(no subject)")
        .chars()
        .take(500)
        .collect::<String>();
    let body_text = message.body_text(0).map(|body| trim_body(body.as_ref()));
    let body_html = message.body_html(0).map(|body| trim_body(body.as_ref()));
    let message_id = normalize_message_id(message.message_id());
    let in_reply_to = header_ids(message.in_reply_to()).first().cloned();
    let references = {
        let ids = header_ids(message.references());
        (!ids.is_empty()).then(|| ids.join(" "))
    };
    let mut thread_ids = Vec::new();
    if let Some(id) = &in_reply_to {
        thread_ids.push(id.clone());
    }
    thread_ids.extend(header_ids(message.references()));

    Ok(ParsedEmail {
        from_email,
        from_name,
        cc,
        subject,
        body_text,
        body_html,
        message_id,
        in_reply_to,
        references,
        thread_ids,
    })
}

fn header_ids(value: &mail_parser::HeaderValue<'_>) -> Vec<String> {
    value
        .as_text_list()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| normalize_message_id(Some(item.as_ref())))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn normalize_message_id(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .map(|value| value.trim_matches(['<', '>']))
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
}

fn trim_body(value: &str) -> String {
    value.trim().chars().take(200_000).collect()
}

async fn find_existing_message(
    state: &AppState,
    message_id: Option<&str>,
) -> Result<Option<support_message::Model>, ApiError> {
    let Some(message_id) = message_id else {
        return Ok(None);
    };
    support_message::Entity::find()
        .filter(support_message::Column::MessageId.eq(message_id))
        .one(&state.db)
        .await
        .map_err(ApiError::from)
}

async fn find_thread_ticket(
    state: &AppState,
    thread_ids: &[String],
) -> Result<Option<support_ticket::Model>, ApiError> {
    if thread_ids.is_empty() {
        return Ok(None);
    }
    let mut condition = Condition::any();
    for id in thread_ids {
        condition = condition.add(support_message::Column::MessageId.eq(id));
    }
    let message = support_message::Entity::find()
        .filter(condition)
        .order_by_desc(support_message::Column::CreatedAt)
        .one(&state.db)
        .await?;
    match message {
        Some(message) => support_ticket::Entity::find_by_id(message.ticket_id)
            .one(&state.db)
            .await
            .map_err(ApiError::from),
        None => Ok(None),
    }
}

async fn ticket_summary(
    state: &AppState,
    ticket: support_ticket::Model,
) -> Result<TicketSummary, ApiError> {
    let message_count = support_message::Entity::find()
        .filter(support_message::Column::TicketId.eq(&ticket.id))
        .count(&state.db)
        .await?;
    Ok(TicketSummary {
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        customer_email: ticket.customer_email,
        customer_name: ticket.customer_name,
        assigned_admin_id: ticket.assigned_admin_id,
        last_message_at: ticket.last_message_at.to_rfc3339(),
        closed_at: ticket.closed_at.map(|value| value.to_rfc3339()),
        created_at: ticket.created_at.to_rfc3339(),
        updated_at: ticket.updated_at.to_rfc3339(),
        message_count,
    })
}

async fn ticket_detail(
    state: &AppState,
    ticket: support_ticket::Model,
) -> Result<TicketDetail, ApiError> {
    let messages = support_message::Entity::find()
        .filter(support_message::Column::TicketId.eq(&ticket.id))
        .order_by_asc(support_message::Column::CreatedAt)
        .all(&state.db)
        .await?
        .into_iter()
        .map(message_wire)
        .collect::<Vec<_>>();
    let events = support_ticket_event::Entity::find()
        .filter(support_ticket_event::Column::TicketId.eq(&ticket.id))
        .order_by_asc(support_ticket_event::Column::CreatedAt)
        .all(&state.db)
        .await?
        .into_iter()
        .map(event_wire)
        .collect::<Vec<_>>();
    let assigned_admin = match &ticket.assigned_admin_id {
        Some(id) => user::Entity::find_by_id(id.clone())
            .one(&state.db)
            .await?
            .map(admin_wire),
        None => None,
    };
    Ok(TicketDetail {
        ticket: ticket_summary(state, ticket).await?,
        messages,
        events,
        assigned_admin,
    })
}

fn message_wire(message: support_message::Model) -> MessageWire {
    MessageWire {
        id: message.id,
        direction: message.direction,
        from_email: message.from_email,
        to_email: message.to_email,
        cc: message
            .cc
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        subject: message.subject,
        body_text: message.body_text,
        body_html: message.body_html,
        message_id: message.message_id,
        in_reply_to: message.in_reply_to,
        references: message.references,
        delivery_status: message.delivery_status,
        delivery_provider_id: message.delivery_provider_id,
        delivery_error: message.delivery_error,
        sent_by_admin_id: message.sent_by_admin_id,
        created_at: message.created_at.to_rfc3339(),
        updated_at: message.updated_at.to_rfc3339(),
    }
}

fn event_wire(event: support_ticket_event::Model) -> EventWire {
    EventWire {
        id: event.id,
        event_type: event.event_type,
        metadata: event.metadata,
        actor_admin_id: event.actor_admin_id,
        created_at: event.created_at.to_rfc3339(),
    }
}

fn admin_wire(admin: user::Model) -> AdminWire {
    AdminWire {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        image: admin.image,
    }
}

async fn create_pending_reply(
    state: &AppState,
    ticket: &support_ticket::Model,
    admin_id: &str,
    body_text: &str,
) -> Result<support_message::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let latest_inbound = support_message::Entity::find()
        .filter(support_message::Column::TicketId.eq(&ticket.id))
        .filter(support_message::Column::Direction.eq("inbound"))
        .order_by_desc(support_message::Column::CreatedAt)
        .one(&state.db)
        .await?;
    let in_reply_to = latest_inbound
        .as_ref()
        .and_then(|message| message.message_id.clone());
    let references = build_references(latest_inbound.as_ref());
    let provider_message_id = format!("{}@support.produktive.app", Uuid::new_v4());
    support_message::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        ticket_id: Set(ticket.id.clone()),
        direction: Set("outbound".to_owned()),
        from_email: Set(state.config.support_email_from.clone()),
        to_email: Set(ticket.customer_email.clone()),
        cc: Set(json!([])),
        subject: Set(reply_subject(&ticket.subject)),
        body_text: Set(Some(body_text.to_owned())),
        body_html: Set(Some(render_reply_html(body_text))),
        message_id: Set(Some(provider_message_id)),
        in_reply_to: Set(in_reply_to),
        references: Set(references),
        raw_object_key: Set(None),
        sent_by_admin_id: Set(Some(admin_id.to_owned())),
        delivery_status: Set("pending".to_owned()),
        delivery_provider_id: Set(None),
        delivery_error: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(ApiError::from)
}

async fn send_new_ticket_auto_reply(
    state: &AppState,
    ticket: &support_ticket::Model,
) -> Result<(), ApiError> {
    let body = "Hey,\n\nWe have received your message. Our support team will review it and get back to you as soon as possible.\n\nSupport can take up to 1-2 business days.\n\nProduktive Support";
    let message = create_pending_system_reply(state, ticket, body).await?;
    let sent = send_support_reply(state, ticket, &message).await;
    let updated_message = update_delivery_result(state, message, sent).await?;
    insert_event(
        state,
        &ticket.id,
        None,
        "auto_reply",
        json!({
            "messageId": updated_message.id,
            "deliveryStatus": updated_message.delivery_status,
            "deliveryError": updated_message.delivery_error,
        }),
    )
    .await
}

async fn create_pending_system_reply(
    state: &AppState,
    ticket: &support_ticket::Model,
    body_text: &str,
) -> Result<support_message::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let latest_inbound = support_message::Entity::find()
        .filter(support_message::Column::TicketId.eq(&ticket.id))
        .filter(support_message::Column::Direction.eq("inbound"))
        .order_by_desc(support_message::Column::CreatedAt)
        .one(&state.db)
        .await?;
    let in_reply_to = latest_inbound
        .as_ref()
        .and_then(|message| message.message_id.clone());
    let references = build_references(latest_inbound.as_ref());
    let provider_message_id = format!("{}@support.produktive.app", Uuid::new_v4());
    support_message::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        ticket_id: Set(ticket.id.clone()),
        direction: Set("outbound".to_owned()),
        from_email: Set(state.config.support_email_from.clone()),
        to_email: Set(ticket.customer_email.clone()),
        cc: Set(json!([])),
        subject: Set(reply_subject(&ticket.subject)),
        body_text: Set(Some(body_text.to_owned())),
        body_html: Set(Some(render_reply_html(body_text))),
        message_id: Set(Some(provider_message_id)),
        in_reply_to: Set(in_reply_to),
        references: Set(references),
        raw_object_key: Set(None),
        sent_by_admin_id: Set(None),
        delivery_status: Set("pending".to_owned()),
        delivery_provider_id: Set(None),
        delivery_error: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(ApiError::from)
}

fn build_references(latest_inbound: Option<&support_message::Model>) -> Option<String> {
    let mut ids = Vec::new();
    if let Some(message) = latest_inbound {
        if let Some(references) = &message.references {
            ids.extend(references.split_whitespace().map(ToOwned::to_owned));
        }
        if let Some(message_id) = &message.message_id {
            ids.push(message_id.clone());
        }
    }
    (!ids.is_empty()).then(|| ids.join(" "))
}

async fn send_support_reply(
    state: &AppState,
    ticket: &support_ticket::Model,
    message: &support_message::Model,
) -> Result<String, String> {
    let url = state
        .config
        .support_email_worker_url
        .as_deref()
        .ok_or_else(|| "SUPPORT_EMAIL_WORKER_URL is not configured".to_owned())?;
    let secret = state
        .config
        .support_worker_secret
        .as_deref()
        .ok_or_else(|| "SUPPORT_WORKER_SECRET is not configured".to_owned())?;
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Payload<'a> {
        to: &'a str,
        from: &'a str,
        subject: &'a str,
        text: &'a str,
        html: Option<&'a str>,
        in_reply_to: Option<String>,
        references: Option<String>,
        ticket_number: &'a str,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkerResponse {
        message_id: String,
    }
    let endpoint = format!("{}/send", url.trim_end_matches('/'));
    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(secret)
        .json(&Payload {
            to: &message.to_email,
            from: &state.config.support_email_from,
            subject: &message.subject,
            text: message.body_text.as_deref().unwrap_or(""),
            html: message.body_html.as_deref(),
            in_reply_to: message.in_reply_to.as_deref().map(format_header_id),
            references: message.references.as_deref().map(format_references),
            ticket_number: &ticket.number,
        })
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Worker send failed with {status}: {body}"));
    }
    response
        .json::<WorkerResponse>()
        .await
        .map(|body| body.message_id)
        .map_err(|error| error.to_string())
}

async fn update_delivery_result(
    state: &AppState,
    message: support_message::Model,
    result: Result<String, String>,
) -> Result<support_message::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let mut active = message.into_active_model();
    match result {
        Ok(provider_id) => {
            active.delivery_status = Set("sent".to_owned());
            active.delivery_provider_id = Set(Some(provider_id));
            active.delivery_error = Set(None);
        }
        Err(error) => {
            tracing::warn!(%error, "support email send failed");
            active.delivery_status = Set("failed".to_owned());
            active.delivery_error = Set(Some(error));
        }
    }
    active.updated_at = Set(now);
    active.update(&state.db).await.map_err(ApiError::from)
}

async fn close_ticket_after_reply(
    state: &AppState,
    ticket_id: &str,
    admin_id: &str,
) -> Result<(), ApiError> {
    let ticket = support_ticket::Entity::find_by_id(ticket_id.to_owned())
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Support ticket not found".to_owned()))?;
    let now = Utc::now().fixed_offset();
    let mut active = ticket.into_active_model();
    active.status = Set("closed".to_owned());
    active.closed_at = Set(Some(now));
    active.updated_at = Set(now);
    let updated = active.update(&state.db).await?;
    insert_event(
        state,
        &updated.id,
        Some(admin_id),
        "ticket_closed",
        json!({ "afterReply": true }),
    )
    .await
}

async fn insert_event(
    state: &AppState,
    ticket_id: &str,
    actor_admin_id: Option<&str>,
    event_type: &str,
    metadata: Value,
) -> Result<(), ApiError> {
    support_ticket_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        ticket_id: Set(ticket_id.to_owned()),
        actor_admin_id: Set(actor_admin_id.map(ToOwned::to_owned)),
        event_type: Set(event_type.to_owned()),
        metadata: Set(metadata),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

fn require_worker_secret(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let expected = state
        .config
        .support_worker_secret
        .as_deref()
        .ok_or_else(|| ApiError::Unauthorized)?;
    let actual = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or(ApiError::Unauthorized)?;
    if actual != expected {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

fn ticket_condition(query: &TicketListQuery) -> Condition {
    let mut condition = Condition::all();
    if let Some(status) = query
        .status
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        if status != "all" {
            condition = condition.add(support_ticket::Column::Status.eq(status));
        }
    }
    if let Some(search) = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let needle = format!("%{search}%");
        condition = condition.add(
            Condition::any()
                .add(support_ticket::Column::Subject.like(&needle))
                .add(support_ticket::Column::CustomerEmail.like(&needle))
                .add(support_ticket::Column::Number.like(&needle)),
        );
    }
    condition
}

fn pagination(page: Option<u64>, limit: Option<u64>) -> (u64, u64, u64) {
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = (page - 1) * limit;
    (page, limit, offset)
}

fn validate_choice(value: String, valid: &[&str], label: &str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if !valid.contains(&value.as_str()) {
        return Err(ApiError::BadRequest(format!("Unsupported {label}")));
    }
    Ok(value)
}

fn reply_subject(subject: &str) -> String {
    if subject.to_ascii_lowercase().starts_with("re:") {
        subject.to_owned()
    } else {
        format!("Re: {subject}")
    }
}

fn render_reply_html(text: &str) -> String {
    let escaped = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    format!("<p>{}</p>", escaped.replace('\n', "<br>"))
}

fn format_header_id(id: &str) -> String {
    let trimmed = id.trim();
    if trimmed.starts_with('<') && trimmed.ends_with('>') {
        trimmed.to_owned()
    } else {
        format!("<{}>", trimmed.trim_matches(['<', '>']))
    }
}

fn format_references(references: &str) -> String {
    references
        .split_whitespace()
        .map(format_header_id)
        .collect::<Vec<_>>()
        .join(" ")
}

fn short_id(id: &str) -> String {
    id.chars().filter(|ch| *ch != '-').take(8).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_thread_headers() {
        let raw = b"From: Customer <customer@example.com>\r\nTo: support@produktive.app\r\nSubject: Help\r\nMessage-ID: <abc@example.com>\r\nIn-Reply-To: <prev@example.com>\r\nReferences: <root@example.com> <prev@example.com>\r\nContent-Type: text/plain\r\n\r\nHello";
        let parsed = parse_email(raw, "fallback@example.com", "support@produktive.app").unwrap();
        assert_eq!(parsed.from_email, "customer@example.com");
        assert_eq!(parsed.message_id.as_deref(), Some("abc@example.com"));
        assert!(parsed.thread_ids.contains(&"prev@example.com".to_owned()));
        assert!(parsed.thread_ids.contains(&"root@example.com".to_owned()));
    }

    #[test]
    fn formats_header_ids_once() {
        assert_eq!(format_header_id("abc@example.com"), "<abc@example.com>");
        assert_eq!(format_header_id("<abc@example.com>"), "<abc@example.com>");
    }
}
