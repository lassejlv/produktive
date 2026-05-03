use crate::{
    auth::require_auth,
    error::ApiError,
    integration_actions::{
        agent_ask, create_issue_for_actor, list_issues_text, require_workspace_member, short_id,
        truncate_for_chat, update_issue_for_actor, IntegrationIssuePatch, IntegrationIssueRequest,
    },
    mcp::{decrypt_secret, encrypt_secret},
    permissions::{require_permission, SLACK_MANAGE},
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use produktive_entity::{
    member, organization, slack_connection, slack_event_claim, slack_link_state, slack_oauth_state,
    slack_user_link,
};
use rand_core::{OsRng, RngCore};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::Sha256;
use url::form_urlencoded;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

const SLACK_AUTHORIZE_URL: &str = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL: &str = "https://slack.com/api/oauth.v2.access";
const SLACK_AUTH_TEST_URL: &str = "https://slack.com/api/auth.test";
const SLACK_POST_MESSAGE_URL: &str = "https://slack.com/api/chat.postMessage";
const SLACK_BOT_SCOPE: &str = "app_mentions:read,chat:write,commands";

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/connection",
            get(get_connection)
                .patch(update_connection)
                .delete(delete_connection),
        )
        .route("/oauth/start", post(start_oauth))
        .route("/oauth/callback", get(oauth_callback))
        .route("/events", post(events))
        .route("/commands", post(commands))
        .route("/link/{state}", get(preview_link).post(complete_link))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionResponse {
    connected: bool,
    team_id: Option<String>,
    team_name: Option<String>,
    bot_user_id: Option<String>,
    scope: Option<String>,
    agent_enabled: bool,
    connected_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthStartResponse {
    url: String,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    state: String,
    code: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionPatchRequest {
    agent_enabled: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkPreviewResponse {
    slack_team_id: String,
    slack_user_id: String,
    expires_at: String,
    linked_organization: LinkedOrganization,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteLinkResponse {
    ok: bool,
    organization: LinkedOrganization,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkedOrganization {
    id: String,
    name: String,
    slug: String,
}

#[derive(Deserialize)]
struct SlackTokenResponse {
    ok: bool,
    access_token: Option<String>,
    scope: Option<String>,
    team: Option<SlackTeam>,
    bot_user_id: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct SlackTeam {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct SlackAuthTestResponse {
    ok: bool,
    bot_id: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct SlackApiOkResponse {
    ok: bool,
    error: Option<String>,
}

#[derive(Clone, Deserialize)]
struct SlackCommandPayload {
    command: String,
    text: String,
    team_id: String,
    user_id: String,
}

#[derive(Clone, Deserialize)]
struct SlackEventEnvelope {
    #[serde(rename = "type")]
    kind: String,
    challenge: Option<String>,
    team_id: Option<String>,
    event_id: Option<String>,
    event: Option<SlackEvent>,
}

#[derive(Clone, Deserialize)]
struct SlackEvent {
    #[serde(rename = "type")]
    kind: String,
    user: Option<String>,
    text: Option<String>,
    channel: Option<String>,
    ts: Option<String>,
}

async fn get_connection(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ConnectionResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let connection = slack_connection::Entity::find()
        .filter(slack_connection::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?;

    Ok(Json(match connection {
        Some(connection) => ConnectionResponse {
            connected: true,
            team_id: Some(connection.slack_team_id),
            team_name: Some(connection.slack_team_name),
            bot_user_id: connection.bot_user_id,
            scope: connection.scope,
            agent_enabled: connection.agent_enabled,
            connected_at: Some(connection.created_at.to_rfc3339()),
        },
        None => ConnectionResponse {
            connected: false,
            team_id: None,
            team_name: None,
            bot_user_id: None,
            scope: None,
            agent_enabled: false,
            connected_at: None,
        },
    }))
}

async fn update_connection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ConnectionPatchRequest>,
) -> Result<Json<ConnectionResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, SLACK_MANAGE).await?;
    let row = slack_connection::Entity::find()
        .filter(slack_connection::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Slack is not connected".to_owned()))?;
    let mut active = row.into_active_model();
    if let Some(enabled) = payload.agent_enabled {
        active.agent_enabled = Set(enabled);
    }
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    Ok(Json(ConnectionResponse {
        connected: true,
        team_id: Some(updated.slack_team_id),
        team_name: Some(updated.slack_team_name),
        bot_user_id: updated.bot_user_id,
        scope: updated.scope,
        agent_enabled: updated.agent_enabled,
        connected_at: Some(updated.created_at.to_rfc3339()),
    }))
}

async fn delete_connection(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, SLACK_MANAGE).await?;
    slack_connection::Entity::delete_many()
        .filter(slack_connection::Column::OrganizationId.eq(&auth.organization.id))
        .exec(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn start_oauth(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OAuthStartResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, SLACK_MANAGE).await?;

    let token = random_state();
    let now = Utc::now().fixed_offset();
    slack_oauth_state::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        state: Set(token.clone()),
        organization_id: Set(auth.organization.id),
        created_by_id: Set(auth.user.id),
        consumed_at: Set(None),
        expires_at: Set((Utc::now() + Duration::minutes(15)).fixed_offset()),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    let url = format!(
        "{}?{}",
        SLACK_AUTHORIZE_URL,
        form_urlencoded::Serializer::new(String::new())
            .append_pair("client_id", &slack_client_id()?)
            .append_pair("scope", SLACK_BOT_SCOPE)
            .append_pair("redirect_uri", &slack_redirect_uri(&state))
            .append_pair("state", &token)
            .finish()
    );
    Ok(Json(OAuthStartResponse { url }))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Redirect, ApiError> {
    let redirect_error = |message: &str| {
        Redirect::to(&format!(
            "{}/workspace/settings?section=integrations&slack=oauth_error&message={}",
            state.config.app_url,
            form_urlencoded::byte_serialize(message.as_bytes()).collect::<String>()
        ))
    };
    if query.error.is_some() {
        return Ok(redirect_error("Slack authorization was cancelled"));
    }
    let code = query
        .code
        .ok_or_else(|| ApiError::BadRequest("Missing Slack OAuth code".to_owned()))?;
    let row = find_pending_oauth_state(&state, &query.state).await?;
    let token = exchange_slack_code(&state, &code).await?;
    let access_token = token
        .access_token
        .ok_or_else(|| ApiError::BadRequest("Slack OAuth did not return a bot token".to_owned()))?;
    let team = token
        .team
        .ok_or_else(|| ApiError::BadRequest("Slack OAuth did not return a team".to_owned()))?;
    let auth_test = slack_auth_test(&access_token).await?;
    let now = Utc::now().fixed_offset();
    upsert_connection(
        &state,
        &row.organization_id,
        &row.created_by_id,
        &team,
        token.bot_user_id,
        auth_test.bot_id,
        &access_token,
        token.scope,
        now,
    )
    .await?;

    let mut active = row.into_active_model();
    active.consumed_at = Set(Some(now));
    active.update(&state.db).await?;

    Ok(Redirect::to(
        "/workspace/settings?section=integrations&slack=oauth_connected",
    ))
}

async fn events(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    verify_slack_signature(&state, &headers, &body)?;
    let envelope: SlackEventEnvelope = serde_json::from_slice(&body)
        .map_err(|_| ApiError::BadRequest("Invalid Slack event payload".to_owned()))?;
    if envelope.kind == "url_verification" {
        return Ok(
            Json(json!({ "challenge": envelope.challenge.unwrap_or_default() })).into_response(),
        );
    }
    if envelope.kind != "event_callback" {
        return Ok(StatusCode::OK.into_response());
    }
    let cloned = state.clone();
    tokio::spawn(async move {
        if let Err(error) = process_event(cloned, envelope).await {
            tracing::warn!(%error, "slack event processing failed");
        }
    });
    Ok(StatusCode::OK.into_response())
}

async fn commands(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    verify_slack_signature(&state, &headers, &body)?;
    let payload = parse_command_payload(&body)?;
    let text = handle_command(&state, payload).await;
    Ok((
        StatusCode::OK,
        [("content-type", "text/plain; charset=utf-8")],
        match text {
            Ok(text) => text,
            Err(error) => error.to_string(),
        },
    )
        .into_response())
}

async fn preview_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(state_value): Path<String>,
) -> Result<Json<LinkPreviewResponse>, ApiError> {
    require_auth(&headers, &state).await?;
    let row = find_pending_link_state(&state, &state_value).await?;
    let org = organization_for_team(&state, &row.slack_team_id).await?;
    Ok(Json(LinkPreviewResponse {
        slack_team_id: row.slack_team_id,
        slack_user_id: row.slack_user_id,
        expires_at: row.expires_at.to_rfc3339(),
        linked_organization: linked_org(org),
    }))
}

async fn complete_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(state_value): Path<String>,
) -> Result<Json<CompleteLinkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let link_state = find_pending_link_state(&state, &state_value).await?;
    let org = organization_for_team(&state, &link_state.slack_team_id).await?;
    require_workspace_member(&state, &org.id, &auth.user.id).await?;
    upsert_user_link(
        &state,
        &link_state.slack_team_id,
        &link_state.slack_user_id,
        &auth.user.id,
    )
    .await?;
    let now = Utc::now().fixed_offset();
    let mut active = link_state.into_active_model();
    active.consumed_at = Set(Some(now));
    active.update(&state.db).await?;
    Ok(Json(CompleteLinkResponse {
        ok: true,
        organization: linked_org(org),
    }))
}

async fn handle_command(
    state: &AppState,
    payload: SlackCommandPayload,
) -> Result<String, ApiError> {
    let command = payload.command.trim_start_matches('/').to_lowercase();
    let mut parts = payload.text.split_whitespace();
    let sub = parts.next().unwrap_or("help").to_lowercase();

    match command.as_str() {
        "produktive" => match sub.as_str() {
            "login" => create_login_link(state, &payload.team_id, &payload.user_id).await,
            "status" => status_message(state, &payload.team_id, &payload.user_id).await,
            "unlink" => unlink_slack(state, &payload.team_id, &payload.user_id).await,
            _ => Ok(help_text()),
        },
        "issue" => {
            let (connection, actor_id, _) =
                linked_context(state, &payload.team_id, &payload.user_id).await?;
            match sub.as_str() {
                "list" => {
                    let args = parse_assignments(parts.collect::<Vec<_>>().join(" "));
                    list_issues_text(
                        state,
                        &connection.organization_id,
                        args.get("status").map(String::as_str),
                        args.get("priority").map(String::as_str),
                    )
                    .await
                }
                "create" => {
                    let raw = parts.collect::<Vec<_>>().join(" ");
                    let (title, args) = parse_title_and_assignments(&raw);
                    let created = create_issue_for_actor(
                        state,
                        &connection.organization_id,
                        &actor_id,
                        IntegrationIssueRequest {
                            title,
                            description: Some(format!("Created from Slack command: {raw}")),
                            status: args.get("status").cloned(),
                            priority: args.get("priority").cloned(),
                        },
                    )
                    .await?;
                    Ok(format!(
                        "Created issue `{}` ({})",
                        created.title,
                        short_id(&created.id)
                    ))
                }
                "update" => {
                    let id = parts
                        .next()
                        .ok_or_else(|| ApiError::BadRequest("Issue id is required".to_owned()))?;
                    let args = parse_assignments(parts.collect::<Vec<_>>().join(" "));
                    let updated = update_issue_for_actor(
                        state,
                        &connection.organization_id,
                        &actor_id,
                        id,
                        IntegrationIssuePatch {
                            title: args.get("title").cloned(),
                            status: args.get("status").cloned(),
                            priority: args.get("priority").cloned(),
                        },
                    )
                    .await?;
                    Ok(format!(
                        "Updated issue `{}` ({})",
                        updated.title,
                        short_id(&updated.id)
                    ))
                }
                _ => Ok("Use `/issue list`, `/issue create <title>`, or `/issue update <id> status=done priority=high title=New title`.".to_owned()),
            }
        }
        "agent" => {
            let (connection, actor_id, membership) =
                linked_context(state, &payload.team_id, &payload.user_id).await?;
            match sub.as_str() {
                "enable" => set_agent_enabled(state, connection, membership, true).await,
                "disable" => set_agent_enabled(state, connection, membership, false).await,
                "ask" => {
                    if !connection.agent_enabled {
                        return Err(ApiError::Forbidden(
                            "The agent is disabled for this Slack workspace".to_owned(),
                        ));
                    }
                    let prompt = parts.collect::<Vec<_>>().join(" ");
                    if prompt.trim().is_empty() {
                        return Err(ApiError::BadRequest("Prompt is required".to_owned()));
                    }
                    agent_ask(
                        state,
                        &connection.organization_id,
                        &actor_id,
                        "Slack",
                        prompt,
                    )
                    .await
                }
                _ => Ok(
                    "Use `/agent ask <prompt>`, `/agent enable`, or `/agent disable`.".to_owned(),
                ),
            }
        }
        _ => Ok(help_text()),
    }
}

async fn process_event(state: AppState, envelope: SlackEventEnvelope) -> Result<(), ApiError> {
    let Some(event) = envelope.event else {
        return Ok(());
    };
    if event.kind != "app_mention" {
        return Ok(());
    }
    let team_id = envelope
        .team_id
        .ok_or_else(|| ApiError::BadRequest("Missing Slack team id".to_owned()))?;
    let event_id = envelope
        .event_id
        .ok_or_else(|| ApiError::BadRequest("Missing Slack event id".to_owned()))?;
    let user_id = event
        .user
        .ok_or_else(|| ApiError::BadRequest("Missing Slack user id".to_owned()))?;
    let channel = event
        .channel
        .ok_or_else(|| ApiError::BadRequest("Missing Slack channel".to_owned()))?;
    let ts = event
        .ts
        .ok_or_else(|| ApiError::BadRequest("Missing Slack timestamp".to_owned()))?;
    let text = event.text.unwrap_or_default();

    let claim = claim_event(&state, &team_id, &event_id, &event.kind).await?;
    let connection = slack_connection::Entity::find()
        .filter(slack_connection::Column::SlackTeamId.eq(&team_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Slack workspace is not connected".to_owned()))?;
    let token = decrypt_secret(
        &state.config.slack_token_key(),
        &connection.access_token_ciphertext,
    )
    .map_err(|error| {
        ApiError::Internal(anyhow::anyhow!("failed to decrypt Slack token: {error}"))
    })?;
    let actor_id = slack_user_link::Entity::find()
        .filter(slack_user_link::Column::SlackTeamId.eq(&team_id))
        .filter(slack_user_link::Column::SlackUserId.eq(&user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| {
            ApiError::Forbidden("Run `/produktive login` before using Slack mentions".to_owned())
        })?
        .user_id;
    require_workspace_member(&state, &connection.organization_id, &actor_id).await?;
    let cleaned = strip_slack_bot_mention(&text, connection.bot_user_id.as_deref());
    let reply = if let Some(request) = parse_mention_issue(&cleaned) {
        let issue =
            create_issue_for_actor(&state, &connection.organization_id, &actor_id, request).await?;
        let mut active = claim.into_active_model();
        active.issue_id = Set(Some(issue.id.clone()));
        active.updated_at = Set(Utc::now().fixed_offset());
        active.update(&state.db).await?;
        format!("Created issue `{}` ({})", issue.title, short_id(&issue.id))
    } else if connection.agent_enabled {
        if cleaned.trim().is_empty() {
            "Mention me with an issue request or a question.".to_owned()
        } else {
            agent_ask(
                &state,
                &connection.organization_id,
                &actor_id,
                "Slack",
                cleaned,
            )
            .await?
        }
    } else {
        "The agent is disabled. Use `create issue ...` to create an issue, or ask an owner to enable the agent.".to_owned()
    };
    post_slack_message(&token, &channel, &ts, &reply).await?;
    Ok(())
}

async fn linked_context(
    state: &AppState,
    team_id: &str,
    slack_user_id: &str,
) -> Result<(slack_connection::Model, String, member::Model), ApiError> {
    let connection = slack_connection::Entity::find()
        .filter(slack_connection::Column::SlackTeamId.eq(team_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Slack workspace is not connected".to_owned()))?;
    let link = slack_user_link::Entity::find()
        .filter(slack_user_link::Column::SlackTeamId.eq(team_id))
        .filter(slack_user_link::Column::SlackUserId.eq(slack_user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Run `/produktive login` first".to_owned()))?;
    let membership =
        require_workspace_member(state, &connection.organization_id, &link.user_id).await?;
    Ok((connection, link.user_id, membership))
}

async fn create_login_link(
    state: &AppState,
    team_id: &str,
    slack_user_id: &str,
) -> Result<String, ApiError> {
    slack_connection::Entity::find()
        .filter(slack_connection::Column::SlackTeamId.eq(team_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Slack workspace is not connected".to_owned()))?;
    let token = random_state();
    let now = Utc::now().fixed_offset();
    slack_link_state::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        state: Set(token.clone()),
        slack_team_id: Set(team_id.to_owned()),
        slack_user_id: Set(slack_user_id.to_owned()),
        consumed_at: Set(None),
        expires_at: Set((Utc::now() + Duration::minutes(15)).fixed_offset()),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(format!(
        "Open this link to connect your Produktive user: {}/slack/link?state={}",
        state.config.app_url, token
    ))
}

async fn status_message(
    state: &AppState,
    team_id: &str,
    slack_user_id: &str,
) -> Result<String, ApiError> {
    let connection = slack_connection::Entity::find()
        .filter(slack_connection::Column::SlackTeamId.eq(team_id))
        .one(&state.db)
        .await?;
    let linked_user = slack_user_link::Entity::find()
        .filter(slack_user_link::Column::SlackTeamId.eq(team_id))
        .filter(slack_user_link::Column::SlackUserId.eq(slack_user_id))
        .one(&state.db)
        .await?;
    let Some(connection) = connection else {
        return Ok("This Slack workspace is not connected to Produktive.".to_owned());
    };
    let org = organization::Entity::find_by_id(&connection.organization_id)
        .one(&state.db)
        .await?;
    Ok(format!(
        "Workspace: {}\nAgent: {}\nYour account: {}",
        org.map(|org| org.name)
            .unwrap_or_else(|| "Unknown".to_owned()),
        if connection.agent_enabled {
            "enabled"
        } else {
            "disabled"
        },
        if linked_user.is_some() {
            "linked"
        } else {
            "not linked"
        }
    ))
}

async fn unlink_slack(
    state: &AppState,
    team_id: &str,
    slack_user_id: &str,
) -> Result<String, ApiError> {
    let (connection, _, membership) = linked_context(state, team_id, slack_user_id).await?;
    if membership.role != "owner" {
        return Err(ApiError::Forbidden(
            "Only workspace owners can unlink Slack".to_owned(),
        ));
    }
    slack_connection::Entity::delete_many()
        .filter(slack_connection::Column::Id.eq(connection.id))
        .exec(&state.db)
        .await?;
    Ok("Slack disconnected from Produktive.".to_owned())
}

async fn set_agent_enabled(
    state: &AppState,
    connection: slack_connection::Model,
    membership: member::Model,
    enabled: bool,
) -> Result<String, ApiError> {
    if membership.role != "owner" {
        return Err(ApiError::Forbidden(
            "Only workspace owners can change agent settings".to_owned(),
        ));
    }
    let mut active = connection.into_active_model();
    active.agent_enabled = Set(enabled);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await?;
    Ok(format!(
        "Agent {}.",
        if enabled { "enabled" } else { "disabled" }
    ))
}

async fn upsert_connection(
    state: &AppState,
    organization_id: &str,
    connected_by_id: &str,
    team: &SlackTeam,
    bot_user_id: Option<String>,
    bot_id: Option<String>,
    access_token: &str,
    scope: Option<String>,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<(), ApiError> {
    let ciphertext =
        encrypt_secret(&state.config.slack_token_key(), access_token).map_err(|error| {
            ApiError::Internal(anyhow::anyhow!("failed to encrypt Slack token: {error}"))
        })?;
    let row = slack_connection::Entity::find()
        .filter(slack_connection::Column::SlackTeamId.eq(&team.id))
        .one(&state.db)
        .await?
        .or(slack_connection::Entity::find()
            .filter(slack_connection::Column::OrganizationId.eq(organization_id))
            .one(&state.db)
            .await?);

    if let Some(row) = row {
        slack_connection::Entity::delete_many()
            .filter(slack_connection::Column::OrganizationId.eq(organization_id))
            .filter(slack_connection::Column::Id.ne(&row.id))
            .exec(&state.db)
            .await?;
        let mut active = row.into_active_model();
        active.organization_id = Set(organization_id.to_owned());
        active.connected_by_id = Set(Some(connected_by_id.to_owned()));
        active.slack_team_id = Set(team.id.clone());
        active.slack_team_name = Set(team.name.clone());
        active.bot_user_id = Set(bot_user_id);
        active.bot_id = Set(bot_id);
        active.access_token_ciphertext = Set(ciphertext);
        active.scope = Set(scope);
        active.updated_at = Set(now);
        active.update(&state.db).await?;
        return Ok(());
    }

    slack_connection::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        connected_by_id: Set(Some(connected_by_id.to_owned())),
        slack_team_id: Set(team.id.clone()),
        slack_team_name: Set(team.name.clone()),
        bot_user_id: Set(bot_user_id),
        bot_id: Set(bot_id),
        access_token_ciphertext: Set(ciphertext),
        scope: Set(scope),
        agent_enabled: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn upsert_user_link(
    state: &AppState,
    team_id: &str,
    slack_user_id: &str,
    user_id: &str,
) -> Result<(), ApiError> {
    let now = Utc::now().fixed_offset();
    if let Some(row) = slack_user_link::Entity::find()
        .filter(slack_user_link::Column::SlackTeamId.eq(team_id))
        .filter(slack_user_link::Column::SlackUserId.eq(slack_user_id))
        .one(&state.db)
        .await?
    {
        let mut active = row.into_active_model();
        active.user_id = Set(user_id.to_owned());
        active.updated_at = Set(now);
        active.update(&state.db).await?;
        return Ok(());
    }
    slack_user_link::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        slack_team_id: Set(team_id.to_owned()),
        slack_user_id: Set(slack_user_id.to_owned()),
        user_id: Set(user_id.to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn claim_event(
    state: &AppState,
    team_id: &str,
    event_id: &str,
    event_type: &str,
) -> Result<slack_event_claim::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    slack_event_claim::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        event_id: Set(event_id.to_owned()),
        slack_team_id: Set(team_id.to_owned()),
        event_type: Set(event_type.to_owned()),
        issue_id: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(|error| {
        tracing::warn!(%error, event_id, "duplicate or failed Slack event claim");
        ApiError::Conflict("Slack event was already handled".to_owned())
    })
}

async fn organization_for_team(
    state: &AppState,
    team_id: &str,
) -> Result<organization::Model, ApiError> {
    let connection = slack_connection::Entity::find()
        .filter(slack_connection::Column::SlackTeamId.eq(team_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Slack workspace is not connected".to_owned()))?;
    organization::Entity::find_by_id(&connection.organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_owned()))
}

async fn find_pending_oauth_state(
    state: &AppState,
    value: &str,
) -> Result<slack_oauth_state::Model, ApiError> {
    let row = slack_oauth_state::Entity::find()
        .filter(slack_oauth_state::Column::State.eq(value))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Slack OAuth state expired".to_owned()))?;
    if row.consumed_at.is_some() || row.expires_at <= Utc::now().fixed_offset() {
        return Err(ApiError::BadRequest("Slack OAuth state expired".to_owned()));
    }
    Ok(row)
}

async fn find_pending_link_state(
    state: &AppState,
    value: &str,
) -> Result<slack_link_state::Model, ApiError> {
    let row = slack_link_state::Entity::find()
        .filter(slack_link_state::Column::State.eq(value))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Slack link expired".to_owned()))?;
    if row.consumed_at.is_some() || row.expires_at <= Utc::now().fixed_offset() {
        return Err(ApiError::BadRequest("Slack link expired".to_owned()));
    }
    Ok(row)
}

async fn exchange_slack_code(state: &AppState, code: &str) -> Result<SlackTokenResponse, ApiError> {
    let client = reqwest::Client::new();
    let response = client
        .post(SLACK_TOKEN_URL)
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", slack_client_id()?),
            ("client_secret", slack_client_secret()?),
            ("code", code.to_owned()),
            ("redirect_uri", slack_redirect_uri(state)),
        ])
        .send()
        .await
        .map_err(|error| ApiError::Internal(error.into()))?
        .json::<SlackTokenResponse>()
        .await
        .map_err(|error| ApiError::Internal(error.into()))?;
    if response.ok {
        Ok(response)
    } else {
        Err(ApiError::BadRequest(format!(
            "Slack OAuth failed: {}",
            response.error.unwrap_or_else(|| "unknown_error".to_owned())
        )))
    }
}

async fn slack_auth_test(token: &str) -> Result<SlackAuthTestResponse, ApiError> {
    let response = reqwest::Client::new()
        .post(SLACK_AUTH_TEST_URL)
        .header(ACCEPT, "application/json")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(|error| ApiError::Internal(error.into()))?
        .json::<SlackAuthTestResponse>()
        .await
        .map_err(|error| ApiError::Internal(error.into()))?;
    if response.ok {
        Ok(response)
    } else {
        Err(ApiError::BadRequest(format!(
            "Slack auth test failed: {}",
            response.error.unwrap_or_else(|| "unknown_error".to_owned())
        )))
    }
}

async fn post_slack_message(
    token: &str,
    channel: &str,
    thread_ts: &str,
    text: &str,
) -> Result<(), ApiError> {
    let response = reqwest::Client::new()
        .post(SLACK_POST_MESSAGE_URL)
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&json!({
            "channel": channel,
            "thread_ts": thread_ts,
            "text": truncate_for_chat(text),
        }))
        .send()
        .await
        .map_err(|error| ApiError::Internal(error.into()))?
        .json::<SlackApiOkResponse>()
        .await
        .map_err(|error| ApiError::Internal(error.into()))?;
    if response.ok {
        Ok(())
    } else {
        Err(ApiError::BadRequest(format!(
            "Slack post failed: {}",
            response.error.unwrap_or_else(|| "unknown_error".to_owned())
        )))
    }
}

fn verify_slack_signature(
    state: &AppState,
    headers: &HeaderMap,
    body: &[u8],
) -> Result<(), ApiError> {
    let secret = slack_signing_secret()?;
    let timestamp = headers
        .get("x-slack-request-timestamp")
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    let signature = headers
        .get("x-slack-signature")
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    verify_slack_signature_parts(&secret, timestamp, signature, body, Utc::now().timestamp())
        .map_err(|_| ApiError::Unauthorized)?;
    let _ = state;
    Ok(())
}

fn verify_slack_signature_parts(
    secret: &str,
    timestamp: &str,
    signature: &str,
    body: &[u8],
    now: i64,
) -> Result<(), ()> {
    let timestamp_i64 = timestamp.parse::<i64>().map_err(|_| ())?;
    if (now - timestamp_i64).abs() > 60 * 5 {
        return Err(());
    }
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|_| ())?;
    mac.update(format!("v0:{timestamp}:").as_bytes());
    mac.update(body);
    let Some(hex_signature) = signature.strip_prefix("v0=") else {
        return Err(());
    };
    let signature_bytes = hex::decode(hex_signature).map_err(|_| ())?;
    mac.verify_slice(&signature_bytes).map_err(|_| ())
}

fn parse_command_payload(body: &[u8]) -> Result<SlackCommandPayload, ApiError> {
    let pairs = form_urlencoded::parse(body)
        .into_owned()
        .collect::<std::collections::HashMap<String, String>>();
    Ok(SlackCommandPayload {
        command: pairs
            .get("command")
            .cloned()
            .ok_or_else(|| ApiError::BadRequest("Missing Slack command".to_owned()))?,
        text: pairs.get("text").cloned().unwrap_or_default(),
        team_id: pairs
            .get("team_id")
            .cloned()
            .ok_or_else(|| ApiError::BadRequest("Missing Slack team".to_owned()))?,
        user_id: pairs
            .get("user_id")
            .cloned()
            .ok_or_else(|| ApiError::BadRequest("Missing Slack user".to_owned()))?,
    })
}

fn parse_mention_issue(content: &str) -> Option<IntegrationIssueRequest> {
    let mut text = content.trim();
    for prefix in ["create issue", "new issue", "issue", "bug:"] {
        if let Some(rest) = text.strip_prefix(prefix) {
            text = rest.trim_start_matches([':', '-', ' ']);
            break;
        }
    }
    if text.is_empty() {
        return None;
    }
    let lower = text.to_lowercase();
    let priority = if lower.contains("urgent") {
        "urgent"
    } else if lower.contains("high priority") || lower.contains("important") {
        "high"
    } else if lower.contains("low priority") {
        "low"
    } else {
        "medium"
    };
    Some(IntegrationIssueRequest {
        title: text.to_owned(),
        description: Some(format!("Created from Slack mention: {text}")),
        status: Some("backlog".to_owned()),
        priority: Some(priority.to_owned()),
    })
}

fn strip_slack_bot_mention(content: &str, bot_user_id: Option<&str>) -> String {
    let Some(bot_user_id) = bot_user_id else {
        return content.trim().to_owned();
    };
    content
        .replace(&format!("<@{bot_user_id}>"), "")
        .trim()
        .to_owned()
}

fn parse_title_and_assignments(raw: &str) -> (String, std::collections::HashMap<String, String>) {
    let args = parse_assignments(raw.to_owned());
    let title = raw
        .split_whitespace()
        .filter(|part| !is_assignment(part))
        .collect::<Vec<_>>()
        .join(" ");
    (title, args)
}

fn parse_assignments(raw: String) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    let mut title_tail = Vec::new();
    let mut title_mode = false;
    for part in raw.split_whitespace() {
        if title_mode {
            title_tail.push(part);
            continue;
        }
        if let Some((key, value)) = part.split_once('=') {
            if key == "title" {
                title_mode = true;
                title_tail.push(value);
            } else {
                out.insert(key.to_lowercase(), value.to_owned());
            }
        }
    }
    if !title_tail.is_empty() {
        out.insert("title".to_owned(), title_tail.join(" "));
    }
    out
}

fn is_assignment(value: &str) -> bool {
    value
        .split_once('=')
        .is_some_and(|(key, _)| matches!(key, "status" | "priority" | "title"))
}

fn linked_org(org: organization::Model) -> LinkedOrganization {
    LinkedOrganization {
        id: org.id,
        name: org.name,
        slug: org.slug,
    }
}

fn help_text() -> String {
    "Use `/produktive login`, `/issue create <title>`, `/issue list`, or `/agent ask <prompt>`."
        .to_owned()
}

fn random_state() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn slack_redirect_uri(state: &AppState) -> String {
    format!("{}/api/slack/oauth/callback", state.config.app_url)
}

fn slack_client_id() -> Result<String, ApiError> {
    env_required("SLACK_CLIENT_ID", "Slack OAuth is not configured")
}

fn slack_client_secret() -> Result<String, ApiError> {
    env_required("SLACK_CLIENT_SECRET", "Slack OAuth is not configured")
}

fn slack_signing_secret() -> Result<String, ApiError> {
    env_required(
        "SLACK_SIGNING_SECRET",
        "Slack signing secret is not configured",
    )
}

fn env_required(key: &str, message: &str) -> Result<String, ApiError> {
    std::env::var(key)
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::BadRequest(message.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_valid_signature() {
        let secret = "secret";
        let timestamp = "100";
        let body = b"{\"type\":\"url_verification\"}";
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(format!("v0:{timestamp}:").as_bytes());
        mac.update(body);
        let signature = format!("v0={}", hex::encode(mac.finalize().into_bytes()));
        assert!(verify_slack_signature_parts(secret, timestamp, &signature, body, 100).is_ok());
    }

    #[test]
    fn rejects_stale_signature() {
        assert!(verify_slack_signature_parts("secret", "100", "v0=nope", b"{}", 500).is_err());
    }

    #[test]
    fn parses_update_title_tail() {
        let args = parse_assignments("status=done priority=high title=Ship Slack bot".to_owned());
        assert_eq!(args.get("status").map(String::as_str), Some("done"));
        assert_eq!(args.get("priority").map(String::as_str), Some("high"));
        assert_eq!(
            args.get("title").map(String::as_str),
            Some("Ship Slack bot")
        );
    }
}
