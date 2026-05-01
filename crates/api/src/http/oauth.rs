use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Form, Query, State},
    http::{header, HeaderMap, HeaderName, HeaderValue},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use produktive_entity::{
    produktive_oauth_client, produktive_oauth_code, produktive_oauth_grant, produktive_oauth_token,
};
use rand_core::{OsRng, RngCore};
use reqwest::Url;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const MCP_SCOPE: &str = "mcp";
const ACCESS_TOKEN_SECONDS: i64 = 60 * 60;
const REFRESH_TOKEN_DAYS: i64 = 30;
const AUTH_CODE_MINUTES: i64 = 10;

pub fn metadata_routes() -> Router<AppState> {
    Router::new().route(
        "/.well-known/oauth-authorization-server",
        get(authorization_server_metadata),
    )
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register_client))
        .route(
            "/authorize",
            get(authorize_preview).post(authorize_decision),
        )
        .route("/token", post(token))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct RegisterClientRequest {
    client_name: Option<String>,
    redirect_uris: Vec<String>,
    grant_types: Option<Vec<String>>,
    response_types: Option<Vec<String>>,
    token_endpoint_auth_method: Option<String>,
    scope: Option<String>,
}

#[derive(Serialize)]
struct RegisterClientResponse {
    client_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_secret_expires_at: Option<i64>,
    client_id_issued_at: i64,
    client_name: String,
    redirect_uris: Vec<String>,
    grant_types: Vec<String>,
    response_types: Vec<String>,
    token_endpoint_auth_method: String,
    scope: String,
}

#[derive(Deserialize, Clone)]
struct AuthorizeQuery {
    response_type: String,
    client_id: String,
    redirect_uri: String,
    state: Option<String>,
    scope: Option<String>,
    code_challenge: String,
    code_challenge_method: String,
    resource: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizePreviewResponse {
    client_name: String,
    scope: String,
    resource: String,
    user: AuthorizeUser,
    organization: AuthorizeOrganization,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizeUser {
    id: String,
    name: String,
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizeOrganization {
    id: String,
    name: String,
    slug: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizeDecisionRequest {
    response_type: String,
    client_id: String,
    redirect_uri: String,
    state: Option<String>,
    scope: Option<String>,
    code_challenge: String,
    code_challenge_method: String,
    resource: Option<String>,
    approve: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RedirectResponse {
    redirect_url: String,
}

#[derive(Deserialize)]
struct TokenRequest {
    grant_type: String,
    code: Option<String>,
    redirect_uri: Option<String>,
    client_id: Option<String>,
    client_secret: Option<String>,
    code_verifier: Option<String>,
    refresh_token: Option<String>,
    resource: Option<String>,
}

#[derive(Serialize)]
struct TokenResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: i64,
    refresh_token: String,
    scope: String,
}

type TokenSuccess = ([(HeaderName, HeaderValue); 2], Json<TokenResponse>);

async fn authorization_server_metadata(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "issuer": state.config.app_url,
        "authorization_endpoint": format!("{}/oauth/authorize", state.config.app_url),
        "token_endpoint": format!("{}/api/oauth/token", state.config.app_url),
        "registration_endpoint": format!("{}/api/oauth/register", state.config.app_url),
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": [MCP_SCOPE],
        "resource_parameter_supported": true,
        "token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
    }))
}

async fn register_client(
    State(state): State<AppState>,
    Json(payload): Json<RegisterClientRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let redirect_uris = validate_redirect_uris(payload.redirect_uris)?;
    let grant_types = payload
        .grant_types
        .unwrap_or_else(|| vec!["authorization_code".to_owned(), "refresh_token".to_owned()]);
    if !grant_types
        .iter()
        .any(|value| value == "authorization_code")
    {
        return Err(ApiError::BadRequest(
            "grant_types must include authorization_code".to_owned(),
        ));
    }
    if grant_types
        .iter()
        .any(|value| value != "authorization_code" && value != "refresh_token")
    {
        return Err(ApiError::BadRequest("Unsupported grant type".to_owned()));
    }
    let response_types = payload
        .response_types
        .unwrap_or_else(|| vec!["code".to_owned()]);
    if response_types != ["code"] {
        return Err(ApiError::BadRequest(
            "Only code response type is supported".to_owned(),
        ));
    }
    let token_endpoint_auth_method = payload
        .token_endpoint_auth_method
        .unwrap_or_else(|| "none".to_owned());
    if !matches!(
        token_endpoint_auth_method.as_str(),
        "none" | "client_secret_basic" | "client_secret_post"
    ) {
        return Err(ApiError::BadRequest(
            "Unsupported token endpoint auth method".to_owned(),
        ));
    }
    let scope = normalize_scope(payload.scope.as_deref())?;
    let client_secret = (token_endpoint_auth_method != "none").then(random_secret);
    let client_secret_expires_at = client_secret.as_ref().map(|_| 0);
    let now = Utc::now().fixed_offset();
    let client_id = format!("mcp_client_{}", Uuid::new_v4().simple());
    let client_name = payload
        .client_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("MCP client")
        .chars()
        .take(100)
        .collect::<String>();

    produktive_oauth_client::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        client_id: Set(client_id.clone()),
        client_secret_hash: Set(client_secret.as_deref().map(hash_token)),
        client_name: Set(client_name.clone()),
        redirect_uris: Set(json!(redirect_uris)),
        grant_types: Set(json!(grant_types)),
        response_types: Set(json!(response_types)),
        token_endpoint_auth_method: Set(token_endpoint_auth_method.clone()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        oauth_json_headers(),
        Json(RegisterClientResponse {
            client_id,
            client_secret,
            client_secret_expires_at,
            client_id_issued_at: now.timestamp(),
            client_name,
            redirect_uris: json_string_array(&json!(redirect_uris)),
            grant_types: json_string_array(&json!(grant_types)),
            response_types: json_string_array(&json!(response_types)),
            token_endpoint_auth_method,
            scope,
        }),
    ))
}

async fn authorize_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuthorizeQuery>,
) -> Result<Json<AuthorizePreviewResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let (client, scope, resource) = validate_authorize_request(&state, &query).await?;
    Ok(Json(AuthorizePreviewResponse {
        client_name: client.client_name,
        scope,
        resource,
        user: AuthorizeUser {
            id: auth.user.id,
            name: auth.user.name,
            email: auth.user.email,
        },
        organization: AuthorizeOrganization {
            id: auth.organization.id,
            name: auth.organization.name,
            slug: auth.organization.slug,
        },
    }))
}

async fn authorize_decision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AuthorizeDecisionRequest>,
) -> Result<Json<RedirectResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let query = AuthorizeQuery {
        response_type: payload.response_type,
        client_id: payload.client_id,
        redirect_uri: payload.redirect_uri,
        state: payload.state,
        scope: payload.scope,
        code_challenge: payload.code_challenge,
        code_challenge_method: payload.code_challenge_method,
        resource: payload.resource,
    };
    let (client, scope, resource) = validate_authorize_request(&state, &query).await?;

    if !payload.approve {
        return Ok(Json(RedirectResponse {
            redirect_url: redirect_with_params(
                &query.redirect_uri,
                &[("error", "access_denied".to_owned())],
                query.state.as_deref(),
            )?,
        }));
    }

    let now = Utc::now().fixed_offset();
    let grant = produktive_oauth_grant::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(auth.user.id.clone()),
        client_id: Set(client.id.clone()),
        selected_organization_id: Set(Some(auth.organization.id.clone())),
        scope: Set(scope.clone()),
        resource: Set(resource.clone()),
        revoked_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    let code = random_secret();
    produktive_oauth_code::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        code_hash: Set(hash_token(&code)),
        client_id: Set(client.id),
        user_id: Set(auth.user.id),
        grant_id: Set(grant.id),
        redirect_uri: Set(query.redirect_uri.clone()),
        code_challenge: Set(query.code_challenge),
        resource: Set(resource),
        scope: Set(scope),
        expires_at: Set((Utc::now() + Duration::minutes(AUTH_CODE_MINUTES)).fixed_offset()),
        used_at: Set(None),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(Json(RedirectResponse {
        redirect_url: redirect_with_params(
            &query.redirect_uri,
            &[("code", code)],
            query.state.as_deref(),
        )?,
    }))
}

async fn token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(payload): Form<TokenRequest>,
) -> Result<TokenSuccess, ApiError> {
    let client = authenticate_client(&state, &headers, &payload).await?;
    match payload.grant_type.as_str() {
        "authorization_code" => exchange_authorization_code(&state, client, payload).await,
        "refresh_token" => refresh_access_token(&state, client, payload).await,
        _ => Err(ApiError::BadRequest("Unsupported grant_type".to_owned())),
    }
}

async fn exchange_authorization_code(
    state: &AppState,
    client: produktive_oauth_client::Model,
    payload: TokenRequest,
) -> Result<TokenSuccess, ApiError> {
    let now = Utc::now().fixed_offset();
    let code = payload
        .code
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("code is required".to_owned()))?;
    let redirect_uri = payload
        .redirect_uri
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("redirect_uri is required".to_owned()))?;
    let code_verifier = payload
        .code_verifier
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("code_verifier is required".to_owned()))?;
    let code_row = produktive_oauth_code::Entity::find()
        .filter(produktive_oauth_code::Column::CodeHash.eq(hash_token(code)))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Invalid authorization code".to_owned()))?;

    if code_row.client_id != client.id
        || code_row.redirect_uri != redirect_uri
        || code_row.used_at.is_some()
        || code_row.expires_at <= now
        || pkce_challenge(code_verifier) != code_row.code_challenge
    {
        return Err(ApiError::BadRequest(
            "Invalid authorization code".to_owned(),
        ));
    }
    if let Some(resource) = payload.resource.as_deref() {
        if resource != code_row.resource {
            return Err(ApiError::BadRequest("Invalid resource".to_owned()));
        }
    }

    let mut active_code = code_row.clone().into_active_model();
    active_code.used_at = Set(Some(now));
    active_code.update(&state.db).await?;

    issue_token_response(
        state,
        &client,
        &code_row.user_id,
        &code_row.grant_id,
        &code_row.scope,
        &code_row.resource,
        None,
    )
    .await
}

async fn refresh_access_token(
    state: &AppState,
    client: produktive_oauth_client::Model,
    payload: TokenRequest,
) -> Result<TokenSuccess, ApiError> {
    let now = Utc::now().fixed_offset();
    let refresh_token = payload
        .refresh_token
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("refresh_token is required".to_owned()))?;
    let token_row = produktive_oauth_token::Entity::find()
        .filter(produktive_oauth_token::Column::RefreshTokenHash.eq(hash_token(refresh_token)))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Invalid refresh token".to_owned()))?;
    if token_row.client_id != client.id
        || token_row.revoked_at.is_some()
        || token_row.refresh_expires_at <= now
    {
        return Err(ApiError::BadRequest("Invalid refresh token".to_owned()));
    }
    let grant = produktive_oauth_grant::Entity::find_by_id(&token_row.grant_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Invalid refresh token".to_owned()))?;
    if grant.revoked_at.is_some() {
        return Err(ApiError::BadRequest("Invalid refresh token".to_owned()));
    }

    let user_id = token_row.user_id.clone();
    let grant_id = token_row.grant_id.clone();
    let scope = token_row.scope.clone();
    let resource = token_row.resource.clone();

    issue_token_response(
        state,
        &client,
        &user_id,
        &grant_id,
        &scope,
        &resource,
        Some(token_row),
    )
    .await
}

async fn issue_token_response(
    state: &AppState,
    client: &produktive_oauth_client::Model,
    user_id: &str,
    grant_id: &str,
    scope: &str,
    resource: &str,
    existing: Option<produktive_oauth_token::Model>,
) -> Result<TokenSuccess, ApiError> {
    let now = Utc::now().fixed_offset();
    let access_token = format!("poat_{}", random_secret());
    let refresh_token = format!("port_{}", random_secret());
    let expires_at = (Utc::now() + Duration::seconds(ACCESS_TOKEN_SECONDS)).fixed_offset();
    let refresh_expires_at = (Utc::now() + Duration::days(REFRESH_TOKEN_DAYS)).fixed_offset();

    if let Some(existing) = existing {
        let mut active = existing.into_active_model();
        active.access_token_hash = Set(hash_token(&access_token));
        active.refresh_token_hash = Set(hash_token(&refresh_token));
        active.expires_at = Set(expires_at);
        active.refresh_expires_at = Set(refresh_expires_at);
        active.revoked_at = Set(None);
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    } else {
        produktive_oauth_token::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            access_token_hash: Set(hash_token(&access_token)),
            refresh_token_hash: Set(hash_token(&refresh_token)),
            client_id: Set(client.id.clone()),
            user_id: Set(user_id.to_owned()),
            grant_id: Set(grant_id.to_owned()),
            scope: Set(scope.to_owned()),
            resource: Set(resource.to_owned()),
            expires_at: Set(expires_at),
            refresh_expires_at: Set(refresh_expires_at),
            revoked_at: Set(None),
            last_used_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&state.db)
        .await?;
    }

    Ok((
        oauth_json_headers(),
        Json(TokenResponse {
            access_token,
            token_type: "Bearer",
            expires_in: ACCESS_TOKEN_SECONDS,
            refresh_token,
            scope: scope.to_owned(),
        }),
    ))
}

async fn authenticate_client(
    state: &AppState,
    headers: &HeaderMap,
    payload: &TokenRequest,
) -> Result<produktive_oauth_client::Model, ApiError> {
    let (client_id, secret) = client_credentials(headers, payload)?;
    let client = produktive_oauth_client::Entity::find()
        .filter(produktive_oauth_client::Column::ClientId.eq(&client_id))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    match client.token_endpoint_auth_method.as_str() {
        "none" => {
            if secret.is_some() {
                return Err(ApiError::Unauthorized);
            }
        }
        "client_secret_basic" | "client_secret_post" => {
            let secret = secret.ok_or(ApiError::Unauthorized)?;
            if client.client_secret_hash.as_deref() != Some(hash_token(&secret).as_str()) {
                return Err(ApiError::Unauthorized);
            }
        }
        _ => return Err(ApiError::Unauthorized),
    }

    Ok(client)
}

fn client_credentials(
    headers: &HeaderMap,
    payload: &TokenRequest,
) -> Result<(String, Option<String>), ApiError> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Basic "))
    {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(value)
            .map_err(|_| ApiError::Unauthorized)?;
        let decoded = String::from_utf8(decoded).map_err(|_| ApiError::Unauthorized)?;
        let (client_id, secret) = decoded.split_once(':').ok_or(ApiError::Unauthorized)?;
        return Ok((client_id.to_owned(), Some(secret.to_owned())));
    }
    let client_id = payload
        .client_id
        .as_deref()
        .ok_or(ApiError::Unauthorized)?
        .to_owned();
    Ok((client_id, payload.client_secret.clone()))
}

async fn validate_authorize_request(
    state: &AppState,
    query: &AuthorizeQuery,
) -> Result<(produktive_oauth_client::Model, String, String), ApiError> {
    if query.response_type != "code" {
        return Err(ApiError::BadRequest(
            "Only code response_type is supported".to_owned(),
        ));
    }
    if query.code_challenge_method != "S256" {
        return Err(ApiError::BadRequest("PKCE S256 is required".to_owned()));
    }
    if query.code_challenge.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "code_challenge is required".to_owned(),
        ));
    }
    let client = produktive_oauth_client::Entity::find()
        .filter(produktive_oauth_client::Column::ClientId.eq(&query.client_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Unknown OAuth client".to_owned()))?;
    let redirect_uris = json_string_array(&client.redirect_uris);
    if !redirect_uris.contains(&query.redirect_uri) {
        return Err(ApiError::BadRequest("Invalid redirect_uri".to_owned()));
    }
    let resource = query
        .resource
        .clone()
        .unwrap_or_else(|| state.config.mcp_resource_url.clone());
    if resource != state.config.mcp_resource_url {
        return Err(ApiError::BadRequest("Invalid resource".to_owned()));
    }
    let scope = normalize_scope(query.scope.as_deref())?;
    Ok((client, scope, resource))
}

fn validate_redirect_uris(values: Vec<String>) -> Result<Vec<String>, ApiError> {
    let mut urls = Vec::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        let parsed = Url::parse(value)
            .map_err(|_| ApiError::BadRequest("redirect_uris must be valid URLs".to_owned()))?;
        match parsed.scheme() {
            "http" | "https" => {}
            _ => {
                return Err(ApiError::BadRequest(
                    "redirect_uris must use http or https".to_owned(),
                ));
            }
        }
        urls.push(value.to_owned());
    }
    if urls.is_empty() {
        return Err(ApiError::BadRequest("redirect_uris is required".to_owned()));
    }
    Ok(urls)
}

fn normalize_scope(scope: Option<&str>) -> Result<String, ApiError> {
    let scopes = scope
        .unwrap_or(MCP_SCOPE)
        .split_whitespace()
        .collect::<Vec<_>>();
    if scopes.is_empty() || !scopes.contains(&MCP_SCOPE) {
        return Err(ApiError::BadRequest("scope must include mcp".to_owned()));
    }
    if scopes.iter().any(|scope| *scope != MCP_SCOPE) {
        return Err(ApiError::BadRequest("Unsupported scope".to_owned()));
    }
    Ok(MCP_SCOPE.to_owned())
}

fn redirect_with_params(
    redirect_uri: &str,
    params: &[(&str, String)],
    state: Option<&str>,
) -> Result<String, ApiError> {
    let mut url = Url::parse(redirect_uri)
        .map_err(|_| ApiError::BadRequest("Invalid redirect_uri".to_owned()))?;
    {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in params {
            pairs.append_pair(key, value);
        }
        if let Some(state) = state {
            pairs.append_pair("state", state);
        }
    }
    Ok(url.to_string())
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn random_secret() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn json_string_array(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect()
}

fn oauth_json_headers() -> [(HeaderName, HeaderValue); 2] {
    [
        (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        (header::PRAGMA, HeaderValue::from_static("no-cache")),
    ]
}
