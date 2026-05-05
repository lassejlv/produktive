use async_trait::async_trait;
use chrono::{DateTime, FixedOffset, Utc};
use produktive_entity::{member, organization, produktive_oauth_grant, produktive_oauth_token, user};
use rust_mcp_sdk::{
    auth::{AuthInfo, AuthProvider, AuthenticationError, OauthEndpoint},
    mcp_http::{http, GenericBody, GenericBodyExt, McpAppState},
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, IntoActiveModel, QueryFilter,
    Set,
};
use serde_json::{json, Map};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration as StdDuration, SystemTime, UNIX_EPOCH},
};

use crate::error::auth_server_error;
use crate::state::AppState;

#[derive(Clone)]
pub(crate) struct ProduktiveAuthProvider {
    pub(crate) state: AppState,
    pub(crate) endpoints: HashMap<String, OauthEndpoint>,
    pub(crate) protected_resource_metadata_url: String,
}

#[async_trait]
impl AuthProvider for ProduktiveAuthProvider {
    async fn verify_token(&self, access_token: String) -> Result<AuthInfo, AuthenticationError> {
        let access_token = normalize_bearer_token(&access_token);
        let now = Utc::now().fixed_offset();
        let token = produktive_oauth_token::Entity::find()
            .filter(produktive_oauth_token::Column::AccessTokenHash.eq(hash_token(access_token)))
            .one(&self.state.db)
            .await
            .map_err(auth_server_error)?
            .ok_or_else(|| AuthenticationError::InvalidToken {
                description: "Invalid MCP OAuth token",
            })?;

        if token.revoked_at.is_some() || token.expires_at <= now {
            return Err(AuthenticationError::InvalidToken {
                description: "MCP OAuth token has expired or was revoked",
            });
        }
        if token.resource != self.state.resource_url {
            return Err(AuthenticationError::InvalidToken {
                description: "MCP OAuth token has the wrong resource",
            });
        }
        let grant = produktive_oauth_grant::Entity::find_by_id(&token.grant_id)
            .one(&self.state.db)
            .await
            .map_err(auth_server_error)?
            .ok_or_else(|| AuthenticationError::InvalidToken {
                description: "MCP OAuth grant no longer exists",
            })?;
        if grant.revoked_at.is_some() || grant.resource != self.state.resource_url {
            return Err(AuthenticationError::InvalidToken {
                description: "MCP OAuth grant is invalid",
            });
        }
        let token_user = user::Entity::find_by_id(&token.user_id)
            .one(&self.state.db)
            .await
            .map_err(auth_server_error)?
            .ok_or_else(|| AuthenticationError::InvalidToken {
                description: "MCP OAuth token user no longer exists",
            })?;
        if token_user.suspended_at.is_some() {
            return Err(AuthenticationError::InvalidToken {
                description: "Produktive user is suspended",
            });
        }

        let expires_at = system_time_from_datetime(token.expires_at)?;

        let mut active = token.clone().into_active_model();
        active.last_used_at = Set(Some(now));
        active.updated_at = Set(now);
        active
            .update(&self.state.db)
            .await
            .map_err(auth_server_error)?;

        let mut extra = Map::new();
        if let Some(organization_id) = valid_selected_workspace(&self.state.db, &grant).await? {
            extra.insert("organization_id".to_owned(), json!(organization_id));
        }
        extra.insert("grant_id".to_owned(), json!(grant.id));

        Ok(AuthInfo {
            token_unique_id: token.id,
            client_id: Some(token.client_id),
            user_id: Some(token.user_id),
            scopes: Some(
                token
                    .scope
                    .split_whitespace()
                    .map(ToOwned::to_owned)
                    .collect(),
            ),
            expires_at: Some(expires_at),
            audience: None,
            extra: Some(extra),
        })
    }

    fn auth_endpoints(&self) -> Option<&HashMap<String, OauthEndpoint>> {
        Some(&self.endpoints)
    }

    async fn handle_request(
        &self,
        request: http::Request<&str>,
        _state: Arc<McpAppState>,
    ) -> Result<http::Response<GenericBody>, rust_mcp_sdk::mcp_server::error::TransportServerError>
    {
        if self.endpoint_type(&request) != Some(&OauthEndpoint::ProtectedResourceMetadata) {
            return Ok(GenericBody::create_404_response());
        }
        let metadata = json!({
            "resource": self.state.resource_url,
            "authorization_servers": [self.state.issuer_url],
            "scopes_supported": ["mcp"],
            "bearer_methods_supported": ["header"],
            "resource_name": "Produktive MCP",
            "resource_documentation": "https://produktive.app",
        });
        Ok(GenericBody::from_value(&metadata).into_json_response(http::StatusCode::OK, None))
    }

    fn protected_resource_metadata_url(&self) -> Option<&str> {
        Some(&self.protected_resource_metadata_url)
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

fn system_time_from_datetime(
    value: DateTime<FixedOffset>,
) -> Result<SystemTime, AuthenticationError> {
    let timestamp = value.timestamp();
    let nanos = value.timestamp_subsec_nanos();
    if timestamp < 0 {
        return Err(AuthenticationError::InvalidToken {
            description: "MCP OAuth token has invalid expiration time",
        });
    }
    Ok(UNIX_EPOCH + StdDuration::new(timestamp as u64, nanos))
}

async fn valid_selected_workspace(
    db: &DatabaseConnection,
    grant: &produktive_oauth_grant::Model,
) -> Result<Option<String>, AuthenticationError> {
    let Some(organization_id) = grant.selected_organization_id.as_deref() else {
        return Ok(None);
    };
    let is_member = member::Entity::find()
        .filter(member::Column::UserId.eq(&grant.user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(db)
        .await
        .map_err(auth_server_error)?
        .is_some();
    if !is_member {
        return Ok(None);
    }
    let organization = organization::Entity::find_by_id(organization_id)
        .one(db)
        .await
        .map_err(auth_server_error)?;
    let Some(organization) = organization else {
        return Ok(None);
    };
    if organization.suspended_at.is_some() {
        return Err(AuthenticationError::InvalidToken {
            description: "Selected Produktive workspace is suspended",
        });
    }
    Ok(Some(organization.id))
}

pub(crate) fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub(crate) fn protected_resource_metadata_path(resource_url: &str) -> String {
    let path = resource_url
        .split_once("://")
        .and_then(|(_, rest)| rest.find('/').map(|index| &rest[index..]))
        .unwrap_or("/");
    if path == "/" {
        "/.well-known/oauth-protected-resource".to_owned()
    } else {
        format!(
            "/.well-known/oauth-protected-resource{}",
            path.trim_end_matches('/')
        )
    }
}

pub(crate) fn protected_resource_metadata_url(resource_url: &str) -> String {
    let origin = resource_url
        .split_once("://")
        .and_then(|(scheme, rest)| {
            let host = rest.split('/').next()?;
            Some(format!("{scheme}://{host}"))
        })
        .unwrap_or_else(|| "https://mcp.produktive.app".to_owned());
    format!("{origin}{}", protected_resource_metadata_path(resource_url))
}
