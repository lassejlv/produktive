use chrono::{Duration, Utc};
use jsonwebtoken::{
    decode as jwt_decode, encode as jwt_encode, DecodingKey, EncodingKey, Header, Validation,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub jti: String, // session id (uuid v7)
    pub exp: i64,
    pub iat: i64,
}

pub fn encode(
    user_id: uuid::Uuid,
    jti: uuid::Uuid,
    secret: &str,
    ttl_hours: i64,
) -> jsonwebtoken::errors::Result<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id.to_string(),
        jti: jti.to_string(),
        iat: now.timestamp(),
        exp: (now + Duration::hours(ttl_hours)).timestamp(),
    };
    jwt_encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn decode(token: &str, secret: &str) -> jsonwebtoken::errors::Result<Claims> {
    let data = jwt_decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}
