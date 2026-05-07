use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sea_orm::prelude::DateTimeWithTimeZone;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Cursor {
    c: String,
    i: String,
}

pub fn encode(created_at: DateTimeWithTimeZone, id: &str) -> String {
    let payload = Cursor {
        c: created_at.to_rfc3339(),
        i: id.to_owned(),
    };
    let json = serde_json::to_vec(&payload).expect("cursor serialize");
    URL_SAFE_NO_PAD.encode(json)
}

pub fn decode(raw: &str) -> Result<(DateTimeWithTimeZone, String), CursorError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(raw.as_bytes())
        .map_err(|_| CursorError::Invalid)?;
    let payload: Cursor = serde_json::from_slice(&bytes).map_err(|_| CursorError::Invalid)?;
    let created_at = DateTimeWithTimeZone::parse_from_rfc3339(&payload.c)
        .map_err(|_| CursorError::Invalid)?;
    Ok((created_at, payload.i))
}

#[derive(Debug)]
pub enum CursorError {
    Invalid,
}

impl std::fmt::Display for CursorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("invalid cursor")
    }
}

impl std::error::Error for CursorError {}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::DateTime;

    #[test]
    fn roundtrip() {
        let original = DateTime::parse_from_rfc3339("2026-05-07T12:39:41.136961+00:00").unwrap();
        let id = "31f2354a-7f6e-4d18-acc1-239cac57cf7c";
        let encoded = encode(original, id);
        let (decoded_at, decoded_id) = decode(&encoded).unwrap();
        assert_eq!(decoded_at, original);
        assert_eq!(decoded_id, id);
    }

    #[test]
    fn rejects_garbage() {
        assert!(decode("not-a-cursor").is_err());
        assert!(decode("").is_err());
    }
}
