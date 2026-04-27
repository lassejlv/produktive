use crate::{error::ApiError, state::AppState};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::http::{header, HeaderMap, HeaderValue};
use chrono::{Duration, Utc};
use cookie::{Cookie, SameSite};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use produktive_entity::{member, organization, session, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait,
    QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use time::Duration as CookieDuration;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct AuthContext {
    pub user: user::Model,
    pub session: session::Model,
    pub organization: organization::Model,
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
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationResponse {
    pub id: String,
    pub name: String,
    pub slug: String,
}

impl From<user::Model> for UserResponse {
    fn from(user: user::Model) -> Self {
        Self {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
        }
    }
}

impl From<organization::Model> for OrganizationResponse {
    fn from(organization: organization::Model) -> Self {
        Self {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
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

    if session.user_id != claims.sub
        || session.active_organization_id != claims.org
        || session.revoked_at.is_some()
        || session.expires_at <= now
    {
        return Err(ApiError::Unauthorized);
    }

    let user = user::Entity::find_by_id(&session.user_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let organization = organization::Entity::find_by_id(&session.active_organization_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

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
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(db)
    .await?;

    let token = sign_session_token(state, &session)?;
    Ok((session, token))
}

pub async fn create_signup_records(
    state: &AppState,
    name: String,
    email: String,
    password: String,
) -> Result<(user::Model, organization::Model, session::Model, String), ApiError> {
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
        password_hash: Set(hash_password(&password)?),
        image: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    let organization = create_default_organization(&txn, &user).await?;
    member::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization.id.clone()),
        user_id: Set(user.id.clone()),
        role: Set("owner".to_owned()),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;

    let (session, token) =
        create_user_session(&state.db, state, &user.id, &organization.id).await?;
    Ok((user, organization, session, token))
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
        role: Set("owner".to_owned()),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&txn)
    .await?;
    txn.commit().await?;

    Ok(organization)
}

pub fn verify_password(password: &str, password_hash: &str) -> Result<bool, ApiError> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|_| ApiError::Internal(anyhow::anyhow!("invalid password hash")))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
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

fn sign_session_token(state: &AppState, session: &session::Model) -> Result<String, ApiError> {
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

fn read_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let header = headers.get(header::COOKIE)?.to_str().ok()?;

    header.split(';').find_map(|part| {
        let (cookie_name, value) = part.trim().split_once('=')?;
        (cookie_name == name).then(|| value.to_owned())
    })
}

async fn create_default_organization(
    txn: &DatabaseTransaction,
    user: &user::Model,
) -> Result<organization::Model, ApiError> {
    let now = Utc::now().fixed_offset();
    let slug_base = user
        .name
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
        .collect::<String>();
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
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(txn)
    .await?)
}
