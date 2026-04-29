use crate::{error::ApiError, state::AppState};
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use produktive_ai::Tool;
use produktive_entity::{mcp_oauth_token, mcp_server};
use reqwest::{
    header::{HeaderName, ACCEPT, AUTHORIZATION, CONTENT_TYPE, WWW_AUTHENTICATE},
    StatusCode, Url,
};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{net::IpAddr, sync::Mutex, time::Duration as StdDuration};

pub const TOOL_PREFIX: &str = "mcp__";
pub const TOOL_LIMIT: usize = 64;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Clone, Debug)]
pub struct RemoteToolName {
    pub server_slug: String,
    pub tool_name: String,
}

#[derive(Debug)]
pub enum ProbeOutcome {
    Connected {
        transport: String,
        tools: Vec<CachedTool>,
    },
    OAuthRequired {
        oauth: Option<OAuthDiscovery>,
    },
}

#[derive(Clone, Debug)]
pub struct OAuthDiscovery {
    pub authorization_endpoint: String,
    pub token_endpoint: Option<String>,
    pub registration_endpoint: Option<String>,
    pub resource: Option<String>,
    pub scopes_supported: Vec<String>,
    pub token_endpoint_auth_methods_supported: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum McpError {
    #[error("{0}")]
    InvalidUrl(String),
    #[error("OAuth is required")]
    OAuthRequired { oauth: Option<OAuthDiscovery> },
    #[error("remote MCP returned status {status}: {body}")]
    Http { status: u16, body: String },
    #[error("remote MCP protocol error: {0}")]
    Protocol(String),
    #[error("remote MCP transport error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("remote MCP decoding error: {0}")]
    Decode(#[from] serde_json::Error),
    #[error("token encryption failed")]
    Crypto,
}

impl From<McpError> for ApiError {
    fn from(error: McpError) -> Self {
        match error {
            McpError::InvalidUrl(message) | McpError::Protocol(message) => {
                ApiError::BadRequest(message)
            }
            McpError::OAuthRequired { .. } => ApiError::BadRequest("OAuth is required".to_owned()),
            other => ApiError::Internal(anyhow::anyhow!(other)),
        }
    }
}

pub fn validate_remote_url(raw: &str, allow_local: bool) -> Result<String, McpError> {
    let url = Url::parse(raw.trim())
        .map_err(|_| McpError::InvalidUrl("Enter a valid MCP URL".to_owned()))?;
    match url.scheme() {
        "https" => {}
        "http" if allow_local && is_local_url(&url) => {}
        _ => {
            return Err(McpError::InvalidUrl(
                "Remote MCP URLs must use HTTPS outside local development".to_owned(),
            ))
        }
    }

    if !allow_local && is_local_url(&url) {
        return Err(McpError::InvalidUrl(
            "Local and private network MCP URLs are not allowed".to_owned(),
        ));
    }

    Ok(url.to_string())
}

pub fn allow_local_mcp() -> bool {
    std::env::var("MCP_ALLOW_LOCAL_URLS")
        .ok()
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes"))
        .unwrap_or(false)
}

pub fn slugify(input: &str) -> String {
    let mut slug = String::new();
    for ch in input.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
        } else if !slug.ends_with('_') {
            slug.push('_');
        }
    }
    let slug = slug.trim_matches('_').to_owned();
    if slug.is_empty() {
        "server".to_owned()
    } else {
        slug.chars().take(40).collect()
    }
}

pub fn default_name(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| "Remote MCP".to_owned())
}

pub fn namespaced_tool_name(server_slug: &str, tool_name: &str) -> String {
    format!(
        "{TOOL_PREFIX}{server_slug}__{}",
        sanitize_tool_name(tool_name)
    )
}

pub fn parse_remote_tool_name(name: &str) -> Option<RemoteToolName> {
    let rest = name.strip_prefix(TOOL_PREFIX)?;
    let (server_slug, tool_name) = rest.split_once("__")?;
    if server_slug.is_empty() || tool_name.is_empty() {
        return None;
    }
    Some(RemoteToolName {
        server_slug: server_slug.to_owned(),
        tool_name: tool_name.to_owned(),
    })
}

pub fn tools_from_servers(servers: &[mcp_server::Model]) -> Vec<Tool> {
    let mut tools = Vec::new();
    for server in servers.iter().filter(|server| server.enabled) {
        if server.auth_status != "connected" {
            continue;
        }
        let cached = cached_tools(server);
        for tool in cached {
            if tools.len() >= TOOL_LIMIT {
                return tools;
            }
            tools.push(Tool {
                name: namespaced_tool_name(&server.slug, &tool.name),
                description: format!("Remote MCP tool from {}: {}", server.name, tool.description),
                parameters: tool.input_schema,
            });
        }
    }
    tools
}

pub fn cached_tools(server: &mcp_server::Model) -> Vec<CachedTool> {
    server
        .tool_cache
        .clone()
        .and_then(|value| serde_json::from_value::<Vec<CachedTool>>(value).ok())
        .unwrap_or_default()
}

pub async fn load_enabled_servers(
    state: &AppState,
    organization_id: &str,
) -> Result<Vec<mcp_server::Model>, ApiError> {
    Ok(mcp_server::Entity::find()
        .filter(mcp_server::Column::OrganizationId.eq(organization_id))
        .filter(mcp_server::Column::Enabled.eq(true))
        .all(&state.db)
        .await?)
}

pub async fn call_remote_tool(
    state: &AppState,
    auth_organization_id: &str,
    parsed: RemoteToolName,
    args: Value,
) -> Result<Value, ApiError> {
    let server = mcp_server::Entity::find()
        .filter(mcp_server::Column::OrganizationId.eq(auth_organization_id))
        .filter(mcp_server::Column::Slug.eq(&parsed.server_slug))
        .filter(mcp_server::Column::Enabled.eq(true))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Remote MCP server not found".to_owned()))?;

    let token = load_access_token(state, &server).await?;
    let client = McpHttpClient::new(server.url.clone(), token)?;
    client.initialize().await?;
    let result = client.call_tool(&parsed.tool_name, args).await;
    match result {
        Ok(value) => Ok(value),
        Err(error) => Ok(json!({ "error": error.to_string() })),
    }
}

pub async fn probe_server(
    url: &str,
    access_token: Option<String>,
) -> Result<ProbeOutcome, McpError> {
    let client = McpHttpClient::new(url.to_owned(), access_token)?;
    match client.initialize().await {
        Ok(transport) => {
            let tools = client.list_tools().await?;
            Ok(ProbeOutcome::Connected { transport, tools })
        }
        Err(McpError::OAuthRequired { oauth }) => Ok(ProbeOutcome::OAuthRequired { oauth }),
        Err(error) => Err(error),
    }
}

pub async fn load_access_token(
    state: &AppState,
    server: &mcp_server::Model,
) -> Result<Option<String>, ApiError> {
    let Some(token) = mcp_oauth_token::Entity::find()
        .filter(mcp_oauth_token::Column::ServerId.eq(&server.id))
        .one(&state.db)
        .await?
    else {
        return Ok(None);
    };

    decrypt_secret(
        &state.config.mcp_token_key(),
        &token.access_token_ciphertext,
    )
    .map(Some)
    .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

pub fn encrypt_secret(key_material: &str, plaintext: &str) -> Result<String, McpError> {
    let key = Sha256::digest(key_material.as_bytes());
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| McpError::Crypto)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| McpError::Crypto)?;
    Ok(format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(nonce),
        URL_SAFE_NO_PAD.encode(ciphertext)
    ))
}

pub fn decrypt_secret(key_material: &str, encoded: &str) -> Result<String, McpError> {
    let (nonce, ciphertext) = encoded.split_once('.').ok_or(McpError::Crypto)?;
    let nonce = URL_SAFE_NO_PAD
        .decode(nonce)
        .map_err(|_| McpError::Crypto)?;
    let ciphertext = URL_SAFE_NO_PAD
        .decode(ciphertext)
        .map_err(|_| McpError::Crypto)?;
    let key = Sha256::digest(key_material.as_bytes());
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| McpError::Crypto)?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| McpError::Crypto)?;
    String::from_utf8(plaintext).map_err(|_| McpError::Crypto)
}

pub fn oauth_state_ttl() -> DateTime<FixedOffset> {
    (Utc::now() + Duration::minutes(10)).fixed_offset()
}

pub fn now() -> DateTime<FixedOffset> {
    Utc::now().fixed_offset()
}

struct McpHttpClient {
    http: reqwest::Client,
    url: String,
    access_token: Option<String>,
    session_id: Mutex<Option<String>>,
}

impl McpHttpClient {
    fn new(url: String, access_token: Option<String>) -> Result<Self, McpError> {
        validate_remote_url(&url, allow_local_mcp())?;
        let http = reqwest::Client::builder()
            .timeout(StdDuration::from_secs(30))
            .build()?;
        Ok(Self {
            http,
            url,
            access_token,
            session_id: Mutex::new(None),
        })
    }

    async fn initialize(&self) -> Result<String, McpError> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": "initialize",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "produktive", "version": "0.1.0" }
            }
        });
        let response = self.request(body).await?;
        if let Some(session_id) = response.session_id {
            self.set_session_id(session_id)?;
            let _ = self
                .request(json!({
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {},
                }))
                .await;
        }
        Ok("streamable_http".to_owned())
    }

    async fn list_tools(&self) -> Result<Vec<CachedTool>, McpError> {
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let mut params = serde_json::Map::new();
            if let Some(cursor) = cursor {
                params.insert("cursor".to_owned(), Value::String(cursor));
            }
            let response = self
                .request(json!({
                    "jsonrpc": "2.0",
                    "id": format!("tools-list-{}", tools.len()),
                    "method": "tools/list",
                    "params": Value::Object(params),
                }))
                .await?;
            let result = response.body.get("result").cloned().unwrap_or(Value::Null);
            let page: ListToolsResult = serde_json::from_value(result)?;
            tools.extend(page.tools.into_iter().map(|tool| {
                CachedTool {
                    name: tool.name,
                    description: tool.description.unwrap_or_default(),
                    input_schema: tool
                        .input_schema
                        .unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
                }
            }));
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        Ok(tools)
    }

    async fn call_tool(&self, name: &str, args: Value) -> Result<Value, McpError> {
        let response = self
            .request(json!({
                "jsonrpc": "2.0",
                "id": "tools-call",
                "method": "tools/call",
                "params": {
                    "name": name,
                    "arguments": args,
                },
            }))
            .await?;
        Ok(response.body.get("result").cloned().unwrap_or(Value::Null))
    }

    async fn request(&self, body: Value) -> Result<McpResponse, McpError> {
        let mut req = self
            .http
            .post(&self.url)
            .header(CONTENT_TYPE, "application/json")
            .header("MCP-Protocol-Version", "2025-06-18")
            .header(ACCEPT, "application/json, text/event-stream")
            .json(&body);
        if let Some(session_id) = self.session_id()? {
            req = req.header("Mcp-Session-Id", session_id);
        }
        if let Some(token) = &self.access_token {
            req = req.header(AUTHORIZATION, format!("Bearer {token}"));
        }

        let response = req.send().await?;
        let status = response.status();
        let session_id = response
            .headers()
            .get(HeaderName::from_static("mcp-session-id"))
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            let authenticate = response
                .headers()
                .get(WWW_AUTHENTICATE)
                .and_then(|value| value.to_str().ok())
                .map(ToOwned::to_owned);
            let oauth = match authenticate {
                Some(header) => discover_oauth_metadata(&self.http, &self.url, &header).await?,
                None => None,
            };
            return Err(McpError::OAuthRequired { oauth });
        }
        let raw = response.text().await?;
        if !status.is_success() {
            return Err(McpError::Http {
                status: status.as_u16(),
                body: readable_error_body(&raw),
            });
        }
        if raw.trim().is_empty() {
            return Ok(McpResponse {
                body: Value::Null,
                session_id,
            });
        }
        let parsed = parse_mcp_body(&raw)?;
        if let Some(error) = parsed.get("error") {
            return Err(McpError::Protocol(readable_protocol_error(error)));
        }
        Ok(McpResponse {
            body: parsed,
            session_id,
        })
    }

    fn set_session_id(&self, session_id: String) -> Result<(), McpError> {
        let mut guard = self
            .session_id
            .lock()
            .map_err(|_| McpError::Protocol("MCP session state is unavailable".to_owned()))?;
        *guard = Some(session_id);
        Ok(())
    }

    fn session_id(&self) -> Result<Option<String>, McpError> {
        self.session_id
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| McpError::Protocol("MCP session state is unavailable".to_owned()))
    }
}

struct McpResponse {
    body: Value,
    session_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListToolsResult {
    #[serde(default)]
    tools: Vec<WireMcpTool>,
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireMcpTool {
    name: String,
    description: Option<String>,
    input_schema: Option<Value>,
}

#[derive(Deserialize)]
struct ProtectedResourceMetadata {
    resource: Option<String>,
    authorization_servers: Option<Vec<String>>,
    scopes_supported: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct AuthorizationServerMetadata {
    authorization_endpoint: Option<String>,
    token_endpoint: Option<String>,
    registration_endpoint: Option<String>,
    scopes_supported: Option<Vec<String>>,
    token_endpoint_auth_methods_supported: Option<Vec<String>>,
}

fn parse_mcp_body(raw: &str) -> Result<Value, McpError> {
    if let Ok(value) = serde_json::from_str::<Value>(raw) {
        return Ok(value);
    }

    let mut last_data = None;
    for line in raw.lines() {
        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            if data != "[DONE]" && !data.is_empty() {
                last_data = Some(data.to_owned());
            }
        }
    }

    let Some(data) = last_data else {
        return Err(McpError::Protocol("Empty MCP response".to_owned()));
    };
    Ok(serde_json::from_str(&data)?)
}

fn readable_error_body(raw: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(raw) else {
        return raw.to_owned();
    };
    value
        .get("error")
        .map(readable_protocol_error)
        .unwrap_or_else(|| value.to_string())
}

fn readable_protocol_error(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| error.to_string())
}

fn sanitize_tool_name(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "tool".to_owned()
    } else {
        out
    }
}

fn is_local_url(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return true;
    };
    if matches!(host, "localhost" | "127.0.0.1" | "::1") {
        return true;
    }
    host.parse::<IpAddr>()
        .map(|ip| match ip {
            IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
            IpAddr::V6(ip) => {
                ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local()
            }
        })
        .unwrap_or(false)
}

async fn discover_oauth_metadata(
    http: &reqwest::Client,
    resource_url: &str,
    authenticate: &str,
) -> Result<Option<OAuthDiscovery>, McpError> {
    let params = parse_www_authenticate_params(authenticate);

    if let Some(authorization_endpoint) = params
        .get("authorization_uri")
        .or_else(|| params.get("authorization_url"))
    {
        return Ok(Some(OAuthDiscovery {
            authorization_endpoint: authorization_endpoint.clone(),
            token_endpoint: infer_token_url(authorization_endpoint),
            registration_endpoint: None,
            resource: Some(resource_url.to_owned()),
            scopes_supported: Vec::new(),
            token_endpoint_auth_methods_supported: vec!["none".to_owned()],
        }));
    }

    let Some(resource_metadata_url) = params
        .get("resource_metadata")
        .or_else(|| params.get("resource_metadata_uri"))
        .cloned()
        .or_else(|| default_resource_metadata_url(resource_url))
    else {
        return Ok(None);
    };

    let protected = fetch_json::<ProtectedResourceMetadata>(http, &resource_metadata_url).await?;
    let resource = protected
        .resource
        .clone()
        .or_else(|| Some(resource_url.to_owned()));
    let protected_scopes = protected.scopes_supported.clone().unwrap_or_default();
    let Some(authorization_server) = protected
        .authorization_servers
        .and_then(|servers| servers.into_iter().next())
    else {
        return Err(McpError::Protocol(
            "OAuth protected-resource metadata did not include authorization_servers".to_owned(),
        ));
    };

    let metadata = fetch_authorization_server_metadata(http, &authorization_server).await?;
    let Some(authorization_endpoint) = metadata.authorization_endpoint else {
        return Err(McpError::Protocol(
            "OAuth metadata did not include authorization_endpoint".to_owned(),
        ));
    };

    let mut scopes_supported = metadata.scopes_supported.unwrap_or_default();
    for scope in protected_scopes {
        if !scopes_supported.contains(&scope) {
            scopes_supported.push(scope);
        }
    }

    Ok(Some(OAuthDiscovery {
        authorization_endpoint,
        token_endpoint: metadata.token_endpoint,
        registration_endpoint: metadata.registration_endpoint,
        resource,
        scopes_supported,
        token_endpoint_auth_methods_supported: metadata
            .token_endpoint_auth_methods_supported
            .unwrap_or_else(|| vec!["none".to_owned()]),
    }))
}

async fn fetch_authorization_server_metadata(
    http: &reqwest::Client,
    authorization_server: &str,
) -> Result<AuthorizationServerMetadata, McpError> {
    let mut urls = Vec::new();
    let parsed = Url::parse(authorization_server)
        .map_err(|_| McpError::Protocol("Invalid OAuth authorization server URL".to_owned()))?;

    if parsed.path().contains("/.well-known/") {
        urls.push(parsed.to_string());
    } else {
        let mut well_known = parsed.clone();
        well_known.set_path("/.well-known/oauth-authorization-server");
        well_known.set_query(None);
        urls.push(well_known.to_string());
        let mut openid = parsed;
        openid.set_path("/.well-known/openid-configuration");
        openid.set_query(None);
        urls.push(openid.to_string());
    }

    let mut last_error = None;
    for url in urls {
        match fetch_json::<AuthorizationServerMetadata>(http, &url).await {
            Ok(metadata) => return Ok(metadata),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        McpError::Protocol("Could not discover OAuth authorization server metadata".to_owned())
    }))
}

async fn fetch_json<T: for<'de> Deserialize<'de>>(
    http: &reqwest::Client,
    url: &str,
) -> Result<T, McpError> {
    let response = http
        .get(url)
        .header(ACCEPT, "application/json")
        .send()
        .await?;
    let status = response.status();
    let raw = response.text().await?;
    if !status.is_success() {
        return Err(McpError::Http {
            status: status.as_u16(),
            body: readable_error_body(&raw),
        });
    }
    Ok(serde_json::from_str(&raw)?)
}

fn parse_www_authenticate_params(header: &str) -> std::collections::HashMap<String, String> {
    let mut params = std::collections::HashMap::new();
    let header = header
        .trim()
        .strip_prefix("Bearer")
        .unwrap_or(header)
        .trim();
    for part in split_quoted(header, ',') {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        params.insert(
            key.trim().to_ascii_lowercase(),
            value.trim().trim_matches('"').to_owned(),
        );
    }
    params
}

fn split_quoted(input: &str, delimiter: char) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            current.push(ch);
            escaped = true;
            continue;
        }
        if ch == '"' {
            in_quotes = !in_quotes;
            current.push(ch);
            continue;
        }
        if ch == delimiter && !in_quotes {
            parts.push(current.trim().to_owned());
            current.clear();
            continue;
        }
        current.push(ch);
    }
    if !current.trim().is_empty() {
        parts.push(current.trim().to_owned());
    }
    parts
}

fn default_resource_metadata_url(resource_url: &str) -> Option<String> {
    let mut url = Url::parse(resource_url).ok()?;
    url.set_path("/.well-known/oauth-protected-resource");
    url.set_query(None);
    Some(url.to_string())
}

fn infer_token_url(authorization_endpoint: &str) -> Option<String> {
    let mut url = Url::parse(authorization_endpoint).ok()?;
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
