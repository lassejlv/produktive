use crate::{
    error::ApiError,
    permissions::{has_permission, API_KEYS_MANAGE, ROLE_OWNER},
    state::AppState,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::http::{header, HeaderMap, HeaderValue};
use chrono::{Duration, Utc};
use cookie::{Cookie, SameSite};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use produktive_entity::{
    auth_token, mcp_api_key, member, organization, platform_admin, session, user,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait,
    IntoActiveModel, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::Duration as CookieDuration;
use unkey_rs::models::{Metadata, VerifyKeyRequest, VerifyKeyResponse};
use uuid::Uuid;

pub const EMAIL_VERIFICATION_PURPOSE: &str = "email_verification";
pub const PASSWORD_RESET_PURPOSE: &str = "password_reset";

#[derive(Clone, Debug)]
pub struct AuthContext {
    pub user: user::Model,
    pub session: session::Model,
    pub organization: organization::Model,
}

#[derive(Clone, Debug)]
pub struct ApiKeyContext {
    pub user: user::Model,
    pub organization: organization::Model,
}

#[derive(Clone, Debug)]
pub struct PlatformAdminContext {
    pub user: user::Model,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    sid: String,
    org: String,
    iat: usize,
    exp: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub user: UserResponse,
    pub organization: OrganizationResponse,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserResponse {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub two_factor_enabled: bool,
    pub image: Option<String>,
    pub onboarding_completed_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub onboarding_step: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationResponse {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub image: Option<String>,
    pub require_two_factor: bool,
}

impl From<user::Model> for UserResponse {
    fn from(user: user::Model) -> Self {
        Self {
            id: user.id,
            name: user.name,
            email: user.email,
            email_verified: user.email_verified,
            two_factor_enabled: user.two_factor_enabled,
            image: user.image,
            onboarding_completed_at: user.onboarding_completed_at,
            onboarding_step: user.onboarding_step,
        }
    }
}

impl From<organization::Model> for OrganizationResponse {
    fn from(organization: organization::Model) -> Self {
        Self {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            image: organization.image,
            require_two_factor: organization.require_two_factor,
        }
    }
}

impl AuthContext {
    pub fn response(&self) -> AuthResponse {
        AuthResponse {
            user: self.user.clone().into(),
            organization: self.organization.clone().into(),
        }
    }
}

pub async fn require_auth(headers: &HeaderMap, state: &AppState) -> Result<AuthContext, ApiError> {
    require_auth_inner(headers, state, true).await
}

pub async fn require_auth_without_two_factor_policy(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<AuthContext, ApiError> {
    require_auth_inner(headers, state, false).await
}

async fn require_auth_inner(
    headers: &HeaderMap,
    state: &AppState,
    enforce_two_factor_policy: bool,
) -> Result<AuthContext, ApiError> {
    let token = read_cookie(headers, &state.config.cookie_name).ok_or(ApiError::Unauthorized)?;
    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?
    .claims;

    let now = Utc::now().fixed_offset();
    let session = session::Entity::find_by_id(&claims.sid)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    if !session_matches_claims(&session, &claims, now) {
        return Err(ApiError::Unauthorized);
    }

    let user = user::Entity::find_by_id(&session.user_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_user_not_suspended(&user)?;
    let organization = organization::Entity::find_by_id(&session.active_organization_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_organization_not_suspended(&organization)?;
    if enforce_two_factor_policy && organization.require_two_factor && !user.two_factor_enabled {
        return Err(ApiError::Forbidden(
            "Two-factor authentication is required for this workspace".to_owned(),
        ));
    }

    let membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&user.id))
        .filter(member::Column::OrganizationId.eq(&organization.id))
        .one(&state.db)
        .await?;

    if membership.is_none() {
        return Err(ApiError::Unauthorized);
    }

    Ok(AuthContext {
        user,
        session,
        organization,
    })
}

pub async fn require_platform_admin(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<PlatformAdminContext, ApiError> {
    let token = read_cookie(headers, &state.config.cookie_name).ok_or(ApiError::Unauthorized)?;
    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?
    .claims;

    let now = Utc::now().fixed_offset();
    let session = session::Entity::find_by_id(&claims.sid)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    if !session_matches_claims(&session, &claims, now) {
        return Err(ApiError::Unauthorized);
    }

    let user = user::Entity::find_by_id(&session.user_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_user_not_suspended(&user)?;

    let role = platform_admin::Entity::find()
        .filter(platform_admin::Column::UserId.eq(&user.id))
        .one(&state.db)
        .await?
        .map(|admin| admin.role)
        .or_else(|| {
            state
                .config
                .platform_admin_emails
                .iter()
                .any(|email| email.eq_ignore_ascii_case(&user.email))
                .then(|| "super_admin".to_owned())
        })
        .ok_or_else(|| ApiError::Forbidden("Platform admin access required".to_owned()))?;

    Ok(PlatformAdminContext { user, role })
}

pub async fn require_api_key(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<ApiKeyContext, ApiError> {
    let token = read_bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    let now = Utc::now().fixed_offset();
    let verified = verify_key_with_unkey(&state.unkey, token).await?;

    if !verified.valid {
        return Err(ApiError::Unauthorized);
    }

    let key = find_local_key_from_unkey(&state.db, &verified).await?;

    if key.revoked_at.is_some() {
        return Err(ApiError::Unauthorized);
    }
    if key.expires_at.is_some_and(|expires_at| expires_at <= now) {
        return Err(ApiError::Unauthorized);
    }

    let organization_id = key
        .active_organization_id
        .clone()
        .ok_or_else(|| ApiError::Forbidden("API key is not pinned to a workspace".to_owned()))?;
    let user = user::Entity::find_by_id(&key.user_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_user_not_suspended(&user)?;
    if !user_is_member(&state.db, &user.id, &organization_id).await? {
        return Err(ApiError::Forbidden(
            "API key user is not a member of this workspace".to_owned(),
        ));
    }
    let organization = organization::Entity::find_by_id(&organization_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_organization_not_suspended(&organization)?;
    if organization.require_two_factor && !user.two_factor_enabled {
        return Err(ApiError::Forbidden(
            "Two-factor authentication is required for this workspace".to_owned(),
        ));
    }

    let mut active = key.clone().into_active_model();
    active.last_used_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(&state.db).await?;

    Ok(ApiKeyContext { user, organization })
}

async fn verify_key_with_unkey(
    unkey: &unkey_rs::Unkey,
    token: String,
) -> Result<VerifyKeyResponse, ApiError> {
    unkey
        .keys()
        .verify_key(VerifyKeyRequest {
            key: token,
            ..Default::default()
        })
        .await
        .map_err(|error| {
            tracing::warn!(%error, "Unkey API key verification failed");
            ApiError::Unauthorized
        })
        .map(|response| response.data)
}

async fn find_local_key_from_unkey(
    db: &DatabaseConnection,
    verified: &VerifyKeyResponse,
) -> Result<mcp_api_key::Model, ApiError> {
    if let Some(unkey_key_id) = verified.key_id.as_deref() {
        if let Some(key) = mcp_api_key::Entity::find()
            .filter(mcp_api_key::Column::UnkeyKeyId.eq(unkey_key_id))
            .one(db)
            .await?
        {
            return Ok(key);
        }
    }

    if let Some(local_key_id) = metadata_string(&verified.meta, "local_key_id") {
        return mcp_api_key::Entity::find_by_id(local_key_id)
            .one(db)
            .await?
            .ok_or(ApiError::Unauthorized);
    }

    Err(ApiError::Unauthorized)
}

fn metadata_string(meta: &Metadata, key: &str) -> Option<String> {
    match meta.get(key) {
        Some(Value::String(value)) if !value.is_empty() => Some(value.clone()),
        _ => None,
    }
}

pub async fn create_user_session(
    db: &DatabaseConnection,
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<(session::Model, String), ApiError> {
    let now = Utc::now().fixed_offset();
    let expires_at = (Utc::now() + Duration::days(state.config.session_days)).fixed_offset();
    let session = session::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(user_id.to_owned()),
        active_organization_id: Set(organization_id.to_owned()),
        expires_at: Set(expires_at),
        revoked_at: Set(None),
        last_two_factor_verified_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(db)
    .await?;

    let token = sign_session_token(state, &session)?;
    Ok((session, token))
}

pub async fn mark_session_two_factor_verified(
    db: &DatabaseConnection,
    session: session::Model,
) -> Result<session::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let mut active: session::ActiveModel = session.into();
    active.last_two_factor_verified_at = Set(Some(now));
    active.updated_at = Set(now);
    Ok(active.update(db).await?)
}

pub fn ensure_fresh_two_factor(auth: &AuthContext) -> Result<(), ApiError> {
    if !auth.user.two_factor_enabled {
        return Ok(());
    }
    let Some(verified_at) = auth.session.last_two_factor_verified_at else {
        return Err(ApiError::Forbidden(
            "Fresh two-factor verification required".to_owned(),
        ));
    };
    if verified_at + Duration::minutes(10) < Utc::now().fixed_offset() {
        return Err(ApiError::Forbidden(
            "Fresh two-factor verification required".to_owned(),
        ));
    }
    Ok(())
}

pub async fn create_signup_records(
    state: &AppState,
    name: String,
    email: String,
    password: String,
) -> Result<(user::Model, organization::Model), ApiError> {
    let txn = state.db.begin().await?;

    let existing = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&txn)
        .await?;

    if existing.is_some() {
        return Err(ApiError::Conflict("Email is already in use".to_owned()));
    }

    let now = Utc::now().fixed_offset();
    let user = user::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        name: Set(name.clone()),
        email: Set(email),
        email_verified: Set(false),
        password_hash: Set(hash_password(&password)?),
        image: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        onboarding_completed_at: Set(None),
        onboarding_step: Set(None),
        suspended_at: Set(None),
        suspended_by_id: Set(None),
        suspension_reason: Set(None),
        suspension_note: Set(None),
        two_factor_enabled: Set(false),
    }
    .insert(&txn)
    .await?;

    let organization = create_default_organization(&txn, &user).await?;
    member::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization.id.clone()),
        user_id: Set(user.id.clone()),
        role: Set(ROLE_OWNER.to_owned()),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;

    Ok((user, organization))
}

pub async fn first_or_create_organization(
    db: &DatabaseConnection,
    user: &user::Model,
) -> Result<organization::Model, ApiError> {
    if let Some(membership) = member::Entity::find()
        .filter(member::Column::UserId.eq(&user.id))
        .order_by_asc(member::Column::CreatedAt)
        .one(db)
        .await?
    {
        if let Some(organization) = organization::Entity::find_by_id(membership.organization_id)
            .one(db)
            .await?
        {
            return Ok(organization);
        }
    }

    let txn = db.begin().await?;
    let organization = create_default_organization(&txn, user).await?;
    member::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization.id.clone()),
        user_id: Set(user.id.clone()),
        role: Set(ROLE_OWNER.to_owned()),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&txn)
    .await?;
    txn.commit().await?;

    Ok(organization)
}

pub async fn create_organization_for_user(
    db: &DatabaseConnection,
    user: &user::Model,
    name: &str,
) -> Result<organization::Model, ApiError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest(
            "Organization name is required".to_owned(),
        ));
    }
    if name.chars().count() > 64 {
        return Err(ApiError::BadRequest(
            "Organization name must be 64 characters or fewer".to_owned(),
        ));
    }

    let now = Utc::now().fixed_offset();
    let txn = db.begin().await?;
    let organization = organization::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        name: Set(name.to_owned()),
        slug: Set(build_organization_slug(name)),
        image: Set(None),
        require_two_factor: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        suspended_at: Set(None),
        suspended_by_id: Set(None),
        suspension_reason: Set(None),
        suspension_note: Set(None),
    }
    .insert(&txn)
    .await?;
    member::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization.id.clone()),
        user_id: Set(user.id.clone()),
        role: Set(ROLE_OWNER.to_owned()),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;
    txn.commit().await?;

    Ok(organization)
}

pub async fn set_session_active_organization(
    db: &DatabaseConnection,
    state: &AppState,
    session: session::Model,
    organization_id: String,
) -> Result<(session::Model, String), ApiError> {
    let now = Utc::now().fixed_offset();
    let mut active: session::ActiveModel = session.into();
    active.active_organization_id = Set(organization_id);
    active.updated_at = Set(now);
    let session = active.update(db).await?;
    let token = sign_session_token(state, &session)?;
    Ok((session, token))
}

pub async fn user_is_member(
    db: &DatabaseConnection,
    user_id: &str,
    organization_id: &str,
) -> Result<bool, ApiError> {
    Ok(member::Entity::find()
        .filter(member::Column::UserId.eq(user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(db)
        .await?
        .is_some())
}

pub fn ensure_user_not_suspended(user: &user::Model) -> Result<(), ApiError> {
    if user.suspended_at.is_some() {
        Err(ApiError::Forbidden("User is suspended".to_owned()))
    } else {
        Ok(())
    }
}

pub fn ensure_organization_not_suspended(
    organization: &organization::Model,
) -> Result<(), ApiError> {
    if organization.suspended_at.is_some() {
        Err(ApiError::Forbidden("Organization is suspended".to_owned()))
    } else {
        Ok(())
    }
}

pub async fn require_workspace_owner(
    db: &DatabaseConnection,
    user_id: &str,
    organization_id: &str,
    message: &str,
) -> Result<(), ApiError> {
    if has_permission(db, user_id, organization_id, API_KEYS_MANAGE).await? {
        return Ok(());
    }

    Err(ApiError::Forbidden(message.to_owned()))
}

pub fn verify_password(password: &str, password_hash: &str) -> Result<bool, ApiError> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|_| ApiError::Internal(anyhow::anyhow!("invalid password hash")))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub async fn create_auth_token(
    db: &DatabaseConnection,
    user_id: &str,
    purpose: &str,
    expires_in: Duration,
) -> Result<String, ApiError> {
    let token = Uuid::new_v4().to_string();
    let now = Utc::now().fixed_offset();

    auth_token::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(user_id.to_owned()),
        token_hash: Set(hash_token(&token)),
        purpose: Set(purpose.to_owned()),
        expires_at: Set((Utc::now() + expires_in).fixed_offset()),
        used_at: Set(None),
        created_at: Set(now),
    }
    .insert(db)
    .await?;

    Ok(token)
}

pub async fn consume_auth_token(
    db: &DatabaseConnection,
    token: &str,
    purpose: &str,
) -> Result<auth_token::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let auth_token = auth_token::Entity::find()
        .filter(auth_token::Column::TokenHash.eq(hash_token(token)))
        .filter(auth_token::Column::Purpose.eq(purpose))
        .one(db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Invalid or expired token".to_owned()))?;

    if auth_token.used_at.is_some() || auth_token.expires_at <= now {
        return Err(ApiError::BadRequest("Invalid or expired token".to_owned()));
    }

    let mut active: auth_token::ActiveModel = auth_token.clone().into();
    active.used_at = Set(Some(now));
    active.update(db).await?;

    Ok(auth_token)
}

pub async fn verify_user_email(
    db: &DatabaseConnection,
    user_id: &str,
) -> Result<user::Model, ApiError> {
    let user = user::Entity::find_by_id(user_id)
        .one(db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Invalid or expired token".to_owned()))?;
    let mut active: user::ActiveModel = user.into();
    active.email_verified = Set(true);
    active.updated_at = Set(Utc::now().fixed_offset());
    Ok(active.update(db).await?)
}

pub async fn update_user_password(
    db: &DatabaseConnection,
    user_id: &str,
    password: &str,
) -> Result<user::Model, ApiError> {
    let user = user::Entity::find_by_id(user_id)
        .one(db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Invalid or expired token".to_owned()))?;
    let mut active: user::ActiveModel = user.into();
    active.password_hash = Set(hash_password(password)?);
    active.updated_at = Set(Utc::now().fixed_offset());
    Ok(active.update(db).await?)
}

pub async fn revoke_user_sessions(db: &DatabaseConnection, user_id: &str) -> Result<(), ApiError> {
    let now = Utc::now().fixed_offset();
    let sessions = session::Entity::find()
        .filter(session::Column::UserId.eq(user_id))
        .filter(session::Column::RevokedAt.is_null())
        .all(db)
        .await?;

    for session in sessions {
        let mut active: session::ActiveModel = session.into();
        active.revoked_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(db).await?;
    }

    Ok(())
}

pub fn auth_cookie(state: &AppState, token: &str) -> Result<HeaderValue, ApiError> {
    let mut cookie = Cookie::build((state.config.cookie_name.clone(), token.to_owned()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.cookie_secure)
        .max_age(CookieDuration::days(state.config.session_days));

    if let Some(domain) = &state.config.cookie_domain {
        cookie = cookie.domain(domain.clone());
    }

    HeaderValue::from_str(&cookie.build().to_string())
        .map_err(|error| ApiError::Internal(error.into()))
}

pub fn clear_auth_cookie(state: &AppState) -> Result<HeaderValue, ApiError> {
    let mut cookie = Cookie::build((state.config.cookie_name.clone(), ""))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.cookie_secure)
        .max_age(CookieDuration::ZERO);

    if let Some(domain) = &state.config.cookie_domain {
        cookie = cookie.domain(domain.clone());
    }

    HeaderValue::from_str(&cookie.build().to_string())
        .map_err(|error| ApiError::Internal(error.into()))
}

pub async fn revoke_session(auth: &AuthContext, db: &DatabaseConnection) -> Result<(), ApiError> {
    let mut session: session::ActiveModel = auth.session.clone().into();
    session.revoked_at = Set(Some(Utc::now().fixed_offset()));
    session.updated_at = Set(Utc::now().fixed_offset());
    session.update(db).await?;
    Ok(())
}

pub fn validate_name(value: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::BadRequest("Name is required".to_owned()));
    }
    Ok(value.to_owned())
}

pub fn validate_email(value: &str) -> Result<String, ApiError> {
    let value = value.trim().to_lowercase();
    if !value.contains('@') || value.len() > 320 {
        return Err(ApiError::BadRequest("A valid email is required".to_owned()));
    }
    Ok(value)
}

pub fn validate_password(value: &str) -> Result<String, ApiError> {
    if value.len() < 8 {
        return Err(ApiError::BadRequest(
            "Password must be at least 8 characters".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error.to_string())))
}

pub(crate) fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub(crate) fn sign_session_token(
    state: &AppState,
    session: &session::Model,
) -> Result<String, ApiError> {
    let claims = Claims {
        sub: session.user_id.clone(),
        sid: session.id.clone(),
        org: session.active_organization_id.clone(),
        iat: Utc::now().timestamp() as usize,
        exp: session.expires_at.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(Into::into)
}

fn session_matches_claims(
    session: &session::Model,
    claims: &Claims,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> bool {
    session.user_id == claims.sub
        && session.active_organization_id == claims.org
        && session.revoked_at.is_none()
        && session.expires_at > now
}

fn read_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let header = headers.get(header::COOKIE)?.to_str().ok()?;

    header.split(';').find_map(|part| {
        let (cookie_name, value) = part.trim().split_once('=')?;
        (cookie_name == name).then(|| value.to_owned())
    })
}

fn read_bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?.trim();
    value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned)
}

async fn create_default_organization(
    txn: &DatabaseTransaction,
    user: &user::Model,
) -> Result<organization::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let slug_base = slugify(&user.name);
    let user_prefix: String = user.id.chars().take(8).collect();
    let slug = format!(
        "{}-{}",
        if slug_base.is_empty() {
            "personal"
        } else {
            &slug_base
        },
        user_prefix
    );

    Ok(organization::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        name: Set(if user.name.trim().is_empty() {
            "Personal Organization".to_owned()
        } else {
            user.name.clone()
        }),
        slug: Set(slug),
        image: Set(None),
        require_two_factor: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        suspended_at: Set(None),
        suspended_by_id: Set(None),
        suspension_reason: Set(None),
        suspension_note: Set(None),
    }
    .insert(txn)
    .await?)
}

fn slugify(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(48)
        .collect()
}

fn build_organization_slug(name: &str) -> String {
    let base = slugify(name);
    let suffix: String = Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(8)
        .collect();
    if base.is_empty() {
        format!("org-{suffix}")
    } else {
        format!("{base}-{suffix}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use unkey_rs::{Unkey, UnkeyConfig};

    fn claims() -> Claims {
        Claims {
            sub: "user_1".to_owned(),
            sid: "session_1".to_owned(),
            org: "org_1".to_owned(),
            iat: 1,
            exp: 2,
        }
    }

    fn session(now: chrono::DateTime<chrono::FixedOffset>) -> session::Model {
        session::Model {
            id: "session_1".to_owned(),
            user_id: "user_1".to_owned(),
            active_organization_id: "org_1".to_owned(),
            expires_at: now + Duration::minutes(5),
            revoked_at: None,
            last_two_factor_verified_at: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn session_claim_validation_rejects_revoked_expired_and_mismatched_sessions() {
        let now = Utc::now().fixed_offset();
        let claims = claims();

        assert!(session_matches_claims(&session(now), &claims, now));

        let mut revoked = session(now);
        revoked.revoked_at = Some(now);
        assert!(!session_matches_claims(&revoked, &claims, now));

        let mut expired = session(now);
        expired.expires_at = now;
        assert!(!session_matches_claims(&expired, &claims, now));

        let mut wrong_org = session(now);
        wrong_org.active_organization_id = "org_2".to_owned();
        assert!(!session_matches_claims(&wrong_org, &claims, now));
    }

    #[tokio::test]
    async fn unkey_transport_failure_rejects_api_key_without_local_fallback() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let base_url = format!(
            "http://{}",
            listener.local_addr().expect("test server address")
        );
        drop(listener);
        let unkey = Unkey::with_config(
            UnkeyConfig::new("root_test")
                .base_url(base_url)
                .max_retries(0),
        )
        .expect("client builds");

        let error = verify_key_with_unkey(&unkey, "pk_api_test".to_owned())
            .await
            .expect_err("transport failure denies the key");

        assert!(matches!(error, ApiError::Unauthorized));
    }
}
