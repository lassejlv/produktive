use crate::{
    auth::{require_auth, AuthContext},
    error::ApiError,
    mcp::{
        allow_local_mcp, cached_tools, default_name, encrypt_secret, namespaced_tool_name, now,
        oauth_state_ttl, probe_server, slugify, validate_remote_url, OAuthDiscovery, ProbeOutcome,
    },
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::{IntoResponse, Redirect},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use produktive_entity::{mcp_oauth_client, mcp_oauth_state, mcp_oauth_token, mcp_server, member};
use reqwest::Url;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/servers", get(list_servers).post(create_server))
        .route(
            "/servers/{id}",
            axum::routing::patch(update_server).delete(delete_server),
        )
        .route("/servers/{id}/refresh-tools", post(refresh_tools))
        .route("/servers/{id}/oauth/start", post(start_oauth))
        .route("/oauth/callback", get(oauth_callback))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServersEnvelope {
    servers: Vec<McpServerResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpServerResponse {
    id: String,
    name: String,
    slug: String,
    url: String,
    transport: Option<String>,
    enabled: bool,
    auth_type: String,
    auth_status: String,
    tools: Vec<McpToolResponse>,
    last_checked_at: Option<String>,
    last_error: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpToolResponse {
    name: String,
    display_name: String,
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerEnvelope {
    server: McpServerResponse,
    oauth_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateServerRequest {
    name: Option<String>,
    url: String,
    access_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateServerRequest {
    name: Option<String>,
    enabled: Option<bool>,
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    state: String,
    code: Option<String>,
    access_token: Option<String>,
    error: Option<String>,
}

struct OAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    token_type: String,
    scope: Option<String>,
    expires_at: Option<DateTime<FixedOffset>>,
}

async fn list_servers(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ServersEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let servers = mcp_server::Entity::find()
        .filter(mcp_server::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(mcp_server::Column::CreatedAt)
        .all(&state.db)
        .await?;
    Ok(Json(ServersEnvelope {
        servers: servers.into_iter().map(server_response).collect(),
    }))
}

async fn create_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateServerRequest>,
) -> Result<Json<ServerEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;

    let url = validate_remote_url(&payload.url, allow_local_mcp())?;
    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| default_name(&url));
    let slug = unique_slug(&state, &auth.organization.id, &slugify(&name)).await?;
    let access_token = payload
        .access_token
        .as_deref()
        .map(normalize_bearer_token)
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned);
    let probe = probe_server(&url, access_token.clone()).await;
    let created_at = now();

    let (transport, auth_type, auth_status, tool_cache, last_error, oauth_url) = match probe {
        Ok(ProbeOutcome::Connected { transport, tools }) => (
            Some(transport),
            if access_token.is_some() {
                "token"
            } else {
                "none"
            }
            .to_owned(),
            "connected".to_owned(),
            Some(json!(tools)),
            None,
            None,
        ),
        Ok(ProbeOutcome::OAuthRequired { .. }) => (
            None,
            "oauth".to_owned(),
            "needs_oauth".to_owned(),
            None,
            Some("OAuth is required".to_owned()),
            None,
        ),
        Ok(ProbeOutcome::TokenRequired) => (
            None,
            "token".to_owned(),
            "needs_token".to_owned(),
            None,
            Some(token_required_message(access_token.is_some())),
            None,
        ),
        Err(error) => (
            None,
            "none".to_owned(),
            "error".to_owned(),
            None,
            Some(error.to_string()),
            None,
        ),
    };

    let server = mcp_server::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        created_by_id: Set(Some(auth.user.id.clone())),
        name: Set(name),
        slug: Set(slug),
        url: Set(url),
        transport: Set(transport),
        enabled: Set(true),
        auth_type: Set(auth_type),
        auth_status: Set(auth_status),
        tool_cache: Set(tool_cache),
        last_checked_at: Set(Some(created_at)),
        last_error: Set(last_error),
        created_at: Set(created_at),
        updated_at: Set(created_at),
    }
    .insert(&state.db)
    .await?;

    if let Some(access_token) = access_token {
        store_access_token(&state, &server, &access_token).await?;
    }

    Ok(Json(ServerEnvelope {
        server: server_response(server),
        oauth_url,
    }))
}

async fn update_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateServerRequest>,
) -> Result<Json<ServerEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let server = find_server(&state, &auth.organization.id, &id).await?;
    let mut active = server.clone().into_active_model();
    if let Some(name) = payload.name {
        let name = name.trim();
        if name.is_empty() {
            return Err(ApiError::BadRequest("Name is required".to_owned()));
        }
        active.name = Set(name.to_owned());
    }
    if let Some(enabled) = payload.enabled {
        active.enabled = Set(enabled);
    }

    let access_token = payload
        .access_token
        .as_deref()
        .map(normalize_bearer_token)
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned);
    let mut token_to_store = None;
    if let Some(access_token) = access_token {
        active.last_checked_at = Set(Some(now()));
        match probe_server(&server.url, Some(access_token.clone())).await {
            Ok(ProbeOutcome::Connected { transport, tools }) => {
                active.transport = Set(Some(transport));
                active.auth_type = Set("token".to_owned());
                active.auth_status = Set("connected".to_owned());
                active.tool_cache = Set(Some(json!(tools)));
                active.last_error = Set(None);
                token_to_store = Some(access_token);
            }
            Ok(ProbeOutcome::OAuthRequired { .. }) | Ok(ProbeOutcome::TokenRequired) => {
                active.auth_type = Set("token".to_owned());
                active.auth_status = Set("needs_token".to_owned());
                active.last_error = Set(Some(token_required_message(true)));
            }
            Err(error) => {
                active.auth_status = Set("error".to_owned());
                active.last_error = Set(Some(error.to_string()));
            }
        }
    }

    active.updated_at = Set(now());
    let server = active.update(&state.db).await?;
    if let Some(access_token) = token_to_store {
        store_access_token(&state, &server, &access_token).await?;
    }
    Ok(Json(ServerEnvelope {
        server: server_response(server),
        oauth_url: None,
    }))
}

async fn delete_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let server = find_server(&state, &auth.organization.id, &id).await?;
    server.delete(&state.db).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

async fn refresh_tools(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ServerEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let server = find_server(&state, &auth.organization.id, &id).await?;
    let token = crate::mcp::load_access_token(&state, &server).await?;
    let had_token = token.is_some();
    let probe = probe_server(&server.url, token).await;
    let mut active = server.into_active_model();
    active.last_checked_at = Set(Some(now()));
    active.updated_at = Set(now());
    match probe {
        Ok(ProbeOutcome::Connected { transport, tools }) => {
            active.transport = Set(Some(transport));
            active.auth_status = Set("connected".to_owned());
            active.tool_cache = Set(Some(json!(tools)));
            active.last_error = Set(None);
        }
        Ok(ProbeOutcome::OAuthRequired { .. }) => {
            active.auth_type = Set("oauth".to_owned());
            active.auth_status = Set("needs_oauth".to_owned());
            active.last_error = Set(Some("OAuth is required".to_owned()));
        }
        Ok(ProbeOutcome::TokenRequired) => {
            active.auth_type = Set("token".to_owned());
            active.auth_status = Set("needs_token".to_owned());
            active.last_error = Set(Some(token_required_message(had_token)));
        }
        Err(error) => {
            active.auth_status = Set("error".to_owned());
            active.last_error = Set(Some(error.to_string()));
        }
    }
    let server = active.update(&state.db).await?;
    Ok(Json(ServerEnvelope {
        server: server_response(server),
        oauth_url: None,
    }))
}

async fn start_oauth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let server = find_server(&state, &auth.organization.id, &id).await?;
    let probe = probe_server(&server.url, None).await;
    let oauth = match probe {
        Ok(ProbeOutcome::OAuthRequired { oauth }) => oauth,
        Err(crate::mcp::McpError::OAuthRequired { oauth }) => oauth,
        _ => None,
    }
    .ok_or_else(|| {
        ApiError::BadRequest("OAuth metadata did not include authorization_endpoint".to_owned())
    })?;

    let state_value = Uuid::new_v4().to_string();
    let code_verifier = pkce_code_verifier();
    let redirect_uri = format!("{}/api/ai/mcp/oauth/callback", state.config.app_url);
    let token_url = oauth.token_endpoint.clone();
    let client_registration =
        ensure_oauth_client_registration(&state, &server, &oauth, &redirect_uri).await?;
    let resource = oauth.resource.clone().or_else(|| Some(server.url.clone()));
    let auth_url = oauth_authorization_url(
        &oauth,
        &client_registration.client_id,
        &state_value,
        &code_verifier,
        &redirect_uri,
        resource.as_deref(),
    )?;
    mcp_oauth_state::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        server_id: Set(server.id),
        organization_id: Set(auth.organization.id),
        created_by_id: Set(auth.user.id),
        state: Set(state_value.clone()),
        code_verifier: Set(code_verifier),
        auth_url: Set(auth_url.clone()),
        token_url: Set(token_url),
        client_id: Set(client_registration.client_id),
        resource: Set(resource),
        expires_at: Set(oauth_state_ttl()),
        created_at: Set(now()),
    }
    .insert(&state.db)
    .await?;

    Ok(Json(json!({ "url": auth_url })))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Redirect, ApiError> {
    let redirect_base = "/workspace/settings?section=ai";
    if let Some(error) = query.error {
        return Ok(Redirect::to(&format!(
            "{redirect_base}&mcp=oauth_error&message={error}"
        )));
    }

    let row = mcp_oauth_state::Entity::find()
        .filter(mcp_oauth_state::Column::State.eq(&query.state))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("OAuth state expired".to_owned()))?;

    if row.expires_at < now() {
        return Err(ApiError::BadRequest("OAuth state expired".to_owned()));
    }

    let server = find_server(&state, &row.organization_id, &row.server_id).await?;
    let token = match (query.access_token, query.code) {
        (Some(token), _) => OAuthTokenResponse {
            access_token: token,
            refresh_token: None,
            token_type: "Bearer".to_owned(),
            scope: None,
            expires_at: None,
        },
        (None, Some(code)) => exchange_oauth_code(&state, &row, &server, &code).await?,
        (None, None) => {
            return Err(ApiError::BadRequest(
                "OAuth callback did not include a token".to_owned(),
            ));
        }
    };
    store_oauth_token(&state, &server, &token).await?;

    let probe = probe_server(&server.url, Some(token.access_token)).await;
    let mut active = server.into_active_model();
    active.auth_type = Set("oauth".to_owned());
    active.last_checked_at = Set(Some(now()));
    active.updated_at = Set(now());
    match probe {
        Ok(ProbeOutcome::Connected { transport, tools }) => {
            active.transport = Set(Some(transport));
            active.auth_status = Set("connected".to_owned());
            active.tool_cache = Set(Some(json!(tools)));
            active.last_error = Set(None);
        }
        Ok(ProbeOutcome::OAuthRequired { .. }) => {
            active.auth_status = Set("needs_oauth".to_owned());
            active.last_error = Set(Some("OAuth token was not accepted".to_owned()));
        }
        Ok(ProbeOutcome::TokenRequired) => {
            active.auth_status = Set("needs_oauth".to_owned());
            active.last_error = Set(Some("OAuth token was not accepted".to_owned()));
        }
        Err(error) => {
            active.auth_status = Set("error".to_owned());
            active.last_error = Set(Some(error.to_string()));
        }
    }
    active.update(&state.db).await?;
    let _ = row.delete(&state.db).await;
    Ok(Redirect::to(&format!(
        "{redirect_base}&mcp=oauth_connected"
    )))
}

async fn find_server(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<mcp_server::Model, ApiError> {
    mcp_server::Entity::find()
        .filter(mcp_server::Column::OrganizationId.eq(organization_id))
        .filter(mcp_server::Column::Id.eq(id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("MCP server not found".to_owned()))
}

async fn unique_slug(
    state: &AppState,
    organization_id: &str,
    base: &str,
) -> Result<String, ApiError> {
    let mut candidate = base.to_owned();
    let mut suffix = 2;
    while mcp_server::Entity::find()
        .filter(mcp_server::Column::OrganizationId.eq(organization_id))
        .filter(mcp_server::Column::Slug.eq(&candidate))
        .one(&state.db)
        .await?
        .is_some()
    {
        candidate = format!("{base}_{suffix}");
        suffix += 1;
    }
    Ok(candidate)
}

async fn store_access_token(
    state: &AppState,
    server: &mcp_server::Model,
    access_token: &str,
) -> Result<(), ApiError> {
    let token = OAuthTokenResponse {
        access_token: access_token.to_owned(),
        refresh_token: None,
        token_type: "Bearer".to_owned(),
        scope: None,
        expires_at: None,
    };
    store_oauth_token(state, server, &token).await
}

async fn store_oauth_token(
    state: &AppState,
    server: &mcp_server::Model,
    token: &OAuthTokenResponse,
) -> Result<(), ApiError> {
    let ciphertext = encrypt_secret(&state.config.mcp_token_key(), &token.access_token)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let refresh_token_ciphertext = match token.refresh_token.as_deref() {
        Some(refresh_token) => Some(
            encrypt_secret(&state.config.mcp_token_key(), refresh_token)
                .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?,
        ),
        None => None,
    };
    if let Some(existing) = mcp_oauth_token::Entity::find()
        .filter(mcp_oauth_token::Column::ServerId.eq(&server.id))
        .one(&state.db)
        .await?
    {
        let mut active = existing.into_active_model();
        active.access_token_ciphertext = Set(ciphertext);
        active.refresh_token_ciphertext = Set(refresh_token_ciphertext);
        active.token_type = Set(token.token_type.clone());
        active.scope = Set(token.scope.clone());
        active.expires_at = Set(token.expires_at);
        active.updated_at = Set(now());
        active.update(&state.db).await?;
        return Ok(());
    }

    mcp_oauth_token::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        server_id: Set(server.id.clone()),
        organization_id: Set(server.organization_id.clone()),
        access_token_ciphertext: Set(ciphertext),
        refresh_token_ciphertext: Set(refresh_token_ciphertext),
        token_type: Set(token.token_type.clone()),
        scope: Set(token.scope.clone()),
        expires_at: Set(token.expires_at),
        created_at: Set(now()),
        updated_at: Set(now()),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn ensure_oauth_client_registration(
    state: &AppState,
    server: &mcp_server::Model,
    oauth: &OAuthDiscovery,
    redirect_uri: &str,
) -> Result<mcp_oauth_client::Model, ApiError> {
    if let Some(existing) = mcp_oauth_client::Entity::find()
        .filter(mcp_oauth_client::Column::ServerId.eq(&server.id))
        .one(&state.db)
        .await?
    {
        return Ok(existing);
    }

    let registration_endpoint = oauth.registration_endpoint.as_deref().ok_or_else(|| {
        ApiError::BadRequest(
            "OAuth client registration is not supported by this MCP server".to_owned(),
        )
    })?;
    let auth_method = preferred_token_auth_method(&oauth.token_endpoint_auth_methods_supported);
    let scope = oauth_scope(&oauth.scopes_supported);
    let response =
        register_oauth_client(registration_endpoint, redirect_uri, &auth_method, &scope).await?;
    let client_secret_ciphertext = match response.client_secret.as_deref() {
        Some(secret) => Some(
            encrypt_secret(&state.config.mcp_token_key(), secret)
                .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?,
        ),
        None => None,
    };
    let registration_access_token_ciphertext = match response.registration_access_token.as_deref() {
        Some(token) => Some(
            encrypt_secret(&state.config.mcp_token_key(), token)
                .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?,
        ),
        None => None,
    };

    let now = now();
    mcp_oauth_client::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        server_id: Set(server.id.clone()),
        organization_id: Set(server.organization_id.clone()),
        client_id: Set(response.client_id),
        client_secret_ciphertext: Set(client_secret_ciphertext),
        token_endpoint_auth_method: Set(response.token_endpoint_auth_method.unwrap_or(auth_method)),
        registration_access_token_ciphertext: Set(registration_access_token_ciphertext),
        registration_client_uri: Set(response.registration_client_uri),
        client_id_issued_at: Set(response.client_id_issued_at.and_then(unix_timestamp)),
        client_secret_expires_at: Set(response.client_secret_expires_at.and_then(|timestamp| {
            if timestamp == 0 {
                None
            } else {
                unix_timestamp(timestamp)
            }
        })),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(Into::into)
}

async fn register_oauth_client(
    registration_endpoint: &str,
    redirect_uri: &str,
    token_endpoint_auth_method: &str,
    scope: &Option<String>,
) -> Result<OAuthClientRegistrationResponse, ApiError> {
    let mut body = json!({
        "client_name": "Produktive",
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": token_endpoint_auth_method,
    });
    if let Some(scope) = scope {
        body["scope"] = Value::String(scope.clone());
    }

    let response = reqwest::Client::new()
        .post(registration_endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    if !status.is_success() {
        return Err(ApiError::BadRequest(format!(
            "OAuth client registration failed: {raw}"
        )));
    }
    serde_json::from_str(&raw).map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

async fn require_owner(state: &AppState, auth: &AuthContext) -> Result<(), ApiError> {
    let role = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?
        .map(|member| member.role);
    if role.as_deref() == Some("owner") {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Only organization owners can manage AI settings".to_owned(),
        ))
    }
}

fn server_response(server: mcp_server::Model) -> McpServerResponse {
    let tools = cached_tools(&server)
        .into_iter()
        .map(|tool| McpToolResponse {
            display_name: namespaced_tool_name(&server.slug, &tool.name),
            name: tool.name,
            description: tool.description,
        })
        .collect();
    McpServerResponse {
        id: server.id,
        name: server.name,
        slug: server.slug,
        url: server.url,
        transport: server.transport,
        enabled: server.enabled,
        auth_type: server.auth_type,
        auth_status: server.auth_status,
        tools,
        last_checked_at: server.last_checked_at.map(|value| value.to_rfc3339()),
        last_error: server.last_error,
        created_at: server.created_at.to_rfc3339(),
        updated_at: server.updated_at.to_rfc3339(),
    }
}

fn token_required_message(had_token: bool) -> String {
    if had_token {
        "The MCP API key was not accepted. Create a new key and add it as the bearer token."
            .to_owned()
    } else {
        "Add a Produktive MCP API key as the bearer token.".to_owned()
    }
}

fn normalize_bearer_token(value: &str) -> &str {
    let value = value.trim();
    value
        .get(..7)
        .filter(|prefix| prefix.eq_ignore_ascii_case("bearer "))
        .and_then(|_| value.get(7..))
        .unwrap_or(value)
        .trim()
}

fn oauth_authorization_url(
    oauth: &OAuthDiscovery,
    client_id: &str,
    state: &str,
    code_verifier: &str,
    redirect_uri: &str,
    resource: Option<&str>,
) -> Result<String, ApiError> {
    let mut url = Url::parse(&oauth.authorization_endpoint).map_err(|_| {
        ApiError::BadRequest("The MCP server returned an invalid OAuth URL".to_owned())
    })?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));
    let already_has_resource = url.query_pairs().any(|(key, _)| key.as_ref() == "resource");
    {
        let mut pairs = url.query_pairs_mut();
        pairs
            .append_pair("response_type", "code")
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("state", state)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256");
        if let Some(scope) = oauth_scope(&oauth.scopes_supported) {
            pairs.append_pair("scope", &scope);
        }
        if let Some(resource) = resource.filter(|_| !already_has_resource) {
            pairs.append_pair("resource", resource);
        }
    }
    Ok(url.to_string())
}

fn pkce_code_verifier() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

async fn exchange_oauth_code(
    state: &AppState,
    oauth_state: &mcp_oauth_state::Model,
    server: &mcp_server::Model,
    code: &str,
) -> Result<OAuthTokenResponse, ApiError> {
    let token_url = oauth_state
        .token_url
        .clone()
        .or_else(|| infer_token_url(&oauth_state.auth_url))
        .ok_or_else(|| ApiError::BadRequest("Could not infer OAuth token endpoint".to_owned()))?;
    let client_registration = mcp_oauth_client::Entity::find()
        .filter(mcp_oauth_client::Column::ServerId.eq(&server.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("OAuth client registration expired".to_owned()))?;
    let redirect_uri = format!("{}/api/ai/mcp/oauth/callback", state.config.app_url);
    let mut form = vec![
        ("grant_type", "authorization_code".to_owned()),
        ("code", code.to_owned()),
        ("redirect_uri", redirect_uri),
        ("code_verifier", oauth_state.code_verifier.clone()),
    ];
    if let Some(resource) = oauth_state
        .resource
        .clone()
        .or_else(|| Some(server.url.clone()))
    {
        form.push(("resource", resource));
    }

    let http = reqwest::Client::new();
    let mut request = http.post(token_url).form(&form);
    if client_registration.token_endpoint_auth_method == "client_secret_basic" {
        let secret = decrypt_oauth_client_secret(state, &client_registration)?;
        request = request.basic_auth(&client_registration.client_id, Some(secret));
    } else if client_registration.token_endpoint_auth_method == "client_secret_post" {
        let secret = decrypt_oauth_client_secret(state, &client_registration)?;
        let mut form = form;
        form.push(("client_id", oauth_state.client_id.clone()));
        form.push(("client_secret", secret));
        request = http
            .post(
                oauth_state
                    .token_url
                    .clone()
                    .or_else(|| infer_token_url(&oauth_state.auth_url))
                    .ok_or_else(|| {
                        ApiError::BadRequest("Could not infer OAuth token endpoint".to_owned())
                    })?,
            )
            .form(&form);
    } else {
        let mut form = form;
        form.push(("client_id", oauth_state.client_id.clone()));
        request = http
            .post(
                oauth_state
                    .token_url
                    .clone()
                    .or_else(|| infer_token_url(&oauth_state.auth_url))
                    .ok_or_else(|| {
                        ApiError::BadRequest("Could not infer OAuth token endpoint".to_owned())
                    })?,
            )
            .form(&form);
    }

    let response = request
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    if !status.is_success() {
        return Err(ApiError::BadRequest(format!(
            "OAuth token exchange failed: {raw}"
        )));
    }
    let parsed: Value =
        serde_json::from_str(&raw).map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let access_token = parsed
        .get("access_token")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            ApiError::BadRequest("OAuth token response did not include access_token".to_owned())
        })?;
    Ok(OAuthTokenResponse {
        access_token,
        refresh_token: parsed
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        token_type: parsed
            .get("token_type")
            .and_then(Value::as_str)
            .unwrap_or("Bearer")
            .to_owned(),
        scope: parsed
            .get("scope")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        expires_at: parsed
            .get("expires_in")
            .and_then(Value::as_i64)
            .map(|seconds| (Utc::now() + Duration::seconds(seconds)).fixed_offset()),
    })
}

fn decrypt_oauth_client_secret(
    state: &AppState,
    client: &mcp_oauth_client::Model,
) -> Result<String, ApiError> {
    let ciphertext = client.client_secret_ciphertext.as_deref().ok_or_else(|| {
        ApiError::BadRequest("OAuth client registration did not include a client secret".to_owned())
    })?;
    crate::mcp::decrypt_secret(&state.config.mcp_token_key(), ciphertext)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

fn preferred_token_auth_method(methods: &[String]) -> String {
    if methods.iter().any(|method| method == "none") {
        "none".to_owned()
    } else if methods.iter().any(|method| method == "client_secret_post") {
        "client_secret_post".to_owned()
    } else if methods.iter().any(|method| method == "client_secret_basic") {
        "client_secret_basic".to_owned()
    } else {
        "none".to_owned()
    }
}

fn oauth_scope(scopes: &[String]) -> Option<String> {
    if scopes.is_empty() {
        None
    } else {
        Some(scopes.join(" "))
    }
}

fn unix_timestamp(timestamp: i64) -> Option<DateTime<FixedOffset>> {
    DateTime::<Utc>::from_timestamp(timestamp, 0).map(|value| value.fixed_offset())
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct OAuthClientRegistrationResponse {
    client_id: String,
    client_secret: Option<String>,
    token_endpoint_auth_method: Option<String>,
    registration_access_token: Option<String>,
    registration_client_uri: Option<String>,
    client_id_issued_at: Option<i64>,
    client_secret_expires_at: Option<i64>,
}

fn infer_token_url(auth_url: &str) -> Option<String> {
    let mut url = Url::parse(auth_url).ok()?;
    let path = url.path().to_owned();
    let token_path = if path.ends_with("/authorize") {
        path.trim_end_matches("/authorize").to_owned() + "/token"
    } else if path.ends_with("/authorization") {
        path.trim_end_matches("/authorization").to_owned() + "/token"
    } else {
        return None;
    };
    url.set_path(&token_path);
    url.set_query(None);
    Some(url.to_string())
}
