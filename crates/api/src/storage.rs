use crate::{config::StorageConfig, error::ApiError};
use anyhow::{anyhow, Context};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredObject {
    pub key: String,
    pub url: String,
}

pub async fn put_object(
    config: &StorageConfig,
    key: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<StoredObject, ApiError> {
    let url = object_url(config, key)?;
    let parsed = Url::parse(&url).context("invalid S3 object URL")?;
    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow!("S3 object URL is missing a host"))?;
    let host_header = match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    };

    let payload_hash = hex::encode(Sha256::digest(&bytes));
    let content_length = bytes.len().to_string();
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let short_date = now.format("%Y%m%d").to_string();
    let canonical_uri = parsed.path();
    let canonical_headers = format!(
        "content-length:{content_length}\ncontent-type:{content_type}\nhost:{host_header}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    );
    let signed_headers = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
    let canonical_request =
        format!("PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}");
    let scope = format!("{short_date}/{}/s3/aws4_request", config.region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );
    let signature = hex::encode(
        signing_key(&config.secret_access_key, &short_date, &config.region)
            .chain_update(string_to_sign.as_bytes())
            .finalize()
            .into_bytes(),
    );
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        config.access_key_id
    );

    let response = reqwest::Client::new()
        .put(&url)
        .header("authorization", authorization)
        .header("content-length", content_length)
        .header("content-type", content_type)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .body(bytes)
        .send()
        .await
        .context("failed to upload object")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(%status, %body, "S3 upload failed");
        return Err(ApiError::Internal(anyhow!("failed to upload attachment")));
    }

    Ok(StoredObject {
        key: key.to_owned(),
        url: public_object_url(config, key),
    })
}

pub async fn get_object(config: &StorageConfig, key: &str) -> Result<Vec<u8>, ApiError> {
    let url = object_url(config, key)?;
    let parsed = Url::parse(&url).context("invalid S3 object URL")?;
    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow!("S3 object URL is missing a host"))?;
    let host_header = match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    };

    let payload_hash = hex::encode(Sha256::digest([]));
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let short_date = now.format("%Y%m%d").to_string();
    let canonical_uri = parsed.path();
    let canonical_headers =
        format!("host:{host_header}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request =
        format!("GET\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}");
    let scope = format!("{short_date}/{}/s3/aws4_request", config.region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );
    let signature = hex::encode(
        signing_key(&config.secret_access_key, &short_date, &config.region)
            .chain_update(string_to_sign.as_bytes())
            .finalize()
            .into_bytes(),
    );
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        config.access_key_id
    );

    let response = reqwest::Client::new()
        .get(&url)
        .header("authorization", authorization)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .send()
        .await
        .context("failed to read object")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(%status, %body, "S3 read failed");
        return Err(ApiError::Internal(anyhow!("failed to read note body")));
    }

    Ok(response
        .bytes()
        .await
        .context("failed to read object bytes")?
        .to_vec())
}

pub async fn get_text_object(config: &StorageConfig, key: &str) -> Result<String, ApiError> {
    String::from_utf8(get_object(config, key).await?)
        .context("S3 object was not valid UTF-8")
        .map_err(ApiError::Internal)
}

pub fn safe_object_key(organization_id: &str, chat_id: &str, filename: &str) -> String {
    format!(
        "organizations/{organization_id}/chats/{chat_id}/attachments/{}-{}",
        uuid::Uuid::new_v4(),
        sanitize_filename(filename)
    )
}

pub fn safe_issue_object_key(organization_id: &str, issue_id: &str, filename: &str) -> String {
    format!(
        "organizations/{organization_id}/issues/{issue_id}/attachments/{}-{}",
        uuid::Uuid::new_v4(),
        sanitize_filename(filename)
    )
}

pub fn safe_issue_github_media_key(
    organization_id: &str,
    issue_id: &str,
    source_hash: &str,
    extension: &str,
) -> String {
    let extension = sanitize_filename(extension.trim_start_matches('.'));
    format!(
        "organizations/{organization_id}/issues/{issue_id}/github-media/{}.{}",
        sanitize_filename(source_hash),
        extension
    )
}

pub fn safe_workspace_icon_key(organization_id: &str, filename: &str) -> String {
    format!(
        "organizations/{organization_id}/icons/{}-{}",
        uuid::Uuid::new_v4(),
        sanitize_filename(filename)
    )
}

pub fn safe_user_icon_key(user_id: &str, filename: &str) -> String {
    format!(
        "users/{user_id}/icons/{}-{}",
        uuid::Uuid::new_v4(),
        sanitize_filename(filename)
    )
}

pub fn safe_note_current_key(organization_id: &str, note_id: &str) -> String {
    format!("organizations/{organization_id}/notes/{note_id}/current.md")
}

pub fn safe_note_version_key(organization_id: &str, note_id: &str, version_id: &str) -> String {
    format!("organizations/{organization_id}/notes/{note_id}/versions/{version_id}.md")
}

fn object_url(config: &StorageConfig, key: &str) -> Result<String, anyhow::Error> {
    let endpoint = config.endpoint.trim_end_matches('/');
    let bucket = sanitize_path_segment(&config.bucket);
    let key = key
        .split('/')
        .map(sanitize_path_segment)
        .collect::<Vec<_>>()
        .join("/");

    Ok(format!("{endpoint}/{bucket}/{key}"))
}

fn public_object_url(config: &StorageConfig, key: &str) -> String {
    let base = config
        .public_url
        .as_deref()
        .unwrap_or_else(|| config.endpoint.as_str())
        .trim_end_matches('/');
    let key = key
        .split('/')
        .map(sanitize_path_segment)
        .collect::<Vec<_>>()
        .join("/");

    if config.public_url.is_some() {
        format!("{base}/{key}")
    } else {
        format!("{base}/{}/{key}", sanitize_path_segment(&config.bucket))
    }
}

fn signing_key(secret: &str, date: &str, region: &str) -> HmacSha256 {
    let date_key = hmac_sha256(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let region_key = hmac_sha256(&date_key, region.as_bytes());
    let service_key = hmac_sha256(&region_key, b"s3");
    let signing_key = hmac_sha256(&service_key, b"aws4_request");
    HmacSha256::new_from_slice(&signing_key).expect("HMAC accepts any key length")
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    HmacSha256::new_from_slice(key)
        .expect("HMAC accepts any key length")
        .chain_update(data)
        .finalize()
        .into_bytes()
        .to_vec()
}

fn sanitize_filename(filename: &str) -> String {
    let sanitized = filename
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "attachment".to_owned()
    } else {
        trimmed.chars().take(96).collect()
    }
}

fn sanitize_path_segment(segment: &str) -> String {
    segment
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | '~') {
                ch.to_string()
            } else {
                format!("%{:02X}", ch as u32)
            }
        })
        .collect()
}
