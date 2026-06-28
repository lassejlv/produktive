use std::time::SystemTime;

use aws_credential_types::Credentials;
use aws_sigv4::http_request::{
    sign, SignableBody, SignableRequest, SigningParams, SigningSettings,
};
use aws_sigv4::sign::v4;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::form_urlencoded;
use uuid::Uuid;

use crate::error::{TigrisError, TigrisResult};

#[derive(Debug, Clone)]
pub struct CreatedAccessKey {
    pub id: String,
    pub secret: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct CreateAccessKeyResponse {
    #[serde(rename = "CreateAccessKeyResult")]
    create_access_key_result: CreateAccessKeyResult,
}

#[derive(Debug, Deserialize)]
struct CreateAccessKeyResult {
    #[serde(rename = "AccessKey")]
    access_key: AccessKeyRecord,
}

#[derive(Debug, Deserialize)]
struct AccessKeyRecord {
    #[serde(rename = "AccessKeyId")]
    access_key_id: String,
    #[serde(rename = "SecretAccessKey")]
    secret_access_key: String,
    #[serde(rename = "UserName")]
    user_name: String,
}

#[derive(Debug, Deserialize)]
struct ErrorResponse {
    #[serde(rename = "Message")]
    message: Option<String>,
}

pub struct IamClient {
    endpoint: String,
    access_key_id: String,
    secret_access_key: String,
    http: reqwest::Client,
}

impl IamClient {
    pub fn new(
        endpoint: String,
        access_key_id: String,
        secret_access_key: String,
        http: reqwest::Client,
    ) -> Self {
        Self {
            endpoint: endpoint.trim_end_matches('/').to_owned(),
            access_key_id,
            secret_access_key,
            http,
        }
    }

    pub async fn create_access_key(
        &self,
        name: &str,
        bucket: &str,
    ) -> TigrisResult<CreatedAccessKey> {
        let req_json = serde_json::json!({
            "req_uuid": Uuid::new_v4().to_string(),
            "name": name,
            "buckets_role": [{
                "bucket": bucket,
                "role": "Editor",
            }],
        })
        .to_string();
        let body = form_urlencoded::Serializer::new(String::new())
            .append_pair("Req", &req_json)
            .finish();
        let path = "/?Action=CreateAccessKeyWithBucketsRole";
        let response = self.signed_post(path, &body).await?;
        if !response.status().is_success() {
            return Err(parse_error(response).await);
        }
        let payload: CreateAccessKeyResponse = response
            .json()
            .await
            .map_err(|e| TigrisError::Iam(e.to_string()))?;
        Ok(CreatedAccessKey {
            id: payload.create_access_key_result.access_key.access_key_id,
            secret: payload
                .create_access_key_result
                .access_key
                .secret_access_key,
            name: payload.create_access_key_result.access_key.user_name,
        })
    }

    pub async fn delete_access_key(&self, access_key_id: &str) -> TigrisResult<()> {
        let body = form_urlencoded::Serializer::new(String::new())
            .append_pair("Action", "DeleteAccessKey")
            .append_pair("Version", "2010-05-08")
            .append_pair("AccessKeyId", access_key_id)
            .finish();
        let path = "/?Action=DeleteAccessKey";
        let response = self.signed_post(path, &body).await?;
        if response.status().is_success() || response.status().as_u16() == 404 {
            Ok(())
        } else {
            Err(parse_error(response).await)
        }
    }

    async fn signed_post(&self, path: &str, body: &str) -> TigrisResult<reqwest::Response> {
        let url = format!("{}{}", self.endpoint, path);
        let mut headers = HeaderMap::new();
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("application/x-www-form-urlencoded"),
        );
        headers.insert(
            HeaderName::from_static("accept"),
            HeaderValue::from_static("application/json"),
        );
        let signed = sign_request(
            "POST",
            &url,
            &headers,
            body.as_bytes(),
            &self.access_key_id,
            &self.secret_access_key,
        )?;
        let mut request = self.http.post(&url).body(body.to_owned());
        for (name, value) in signed {
            request = request.header(name, value);
        }
        request
            .send()
            .await
            .map_err(|e| TigrisError::Iam(e.to_string()))
    }
}

async fn parse_error(response: reqwest::Response) -> TigrisError {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if let Ok(payload) = serde_json::from_str::<ErrorResponse>(&text) {
        if let Some(message) = payload.message.filter(|m| !m.is_empty()) {
            return TigrisError::Iam(format!("{status}: {message}"));
        }
    }
    TigrisError::Iam(format!("{status}: {text}"))
}

fn sign_request(
    method: &str,
    url: &str,
    headers: &HeaderMap,
    body: &[u8],
    access_key_id: &str,
    secret_access_key: &str,
) -> TigrisResult<Vec<(HeaderName, HeaderValue)>> {
    let creds = Credentials::new(access_key_id, secret_access_key, None, None, "tigris");
    let identity = creds.into();
    let signing_settings = SigningSettings::default();
    let signing_params: SigningParams = v4::SigningParams::builder()
        .identity(&identity)
        .region("auto")
        .name("s3")
        .time(SystemTime::now())
        .settings(signing_settings)
        .build()
        .map_err(|e| TigrisError::Iam(e.to_string()))?
        .into();

    // Match the Tigris JS SDK (`@smithy/signature-v4` with `applyChecksum: true`):
    // add `x-amz-content-sha256` to the headers _before_ signing so it becomes part
    // of the canonical request. The default `PayloadChecksumKind::NoHeader` signs
    // with the real payload hash but omits the header, which the IAM endpoint then
    // treats as UNSIGNED-PAYLOAD, causing a SignatureDoesNotMatch.
    let payload_hash = sha256_hex(body);
    let mut signable_headers_vec: Vec<(String, String)> = Vec::with_capacity(headers.len() + 1);
    for (name, value) in headers.iter() {
        signable_headers_vec.push((
            name.as_str().to_owned(),
            value.to_str().unwrap_or_default().to_owned(),
        ));
    }
    signable_headers_vec.push(("x-amz-content-sha256".to_owned(), payload_hash.clone()));
    let signable_headers = signable_headers_vec
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()));

    let signable_request =
        SignableRequest::new(method, url, signable_headers, SignableBody::Bytes(body))
            .map_err(|e| TigrisError::Iam(e.to_string()))?;

    let (instructions, _signature) = sign(signable_request, &signing_params)
        .map_err(|e| TigrisError::Iam(e.to_string()))?
        .into_parts();

    let mut signed = Vec::new();
    for (key, value) in headers.iter() {
        signed.push((key.clone(), value.clone()));
    }
    signed.push((
        HeaderName::from_static("x-amz-content-sha256"),
        HeaderValue::from_str(&payload_hash).map_err(|e| TigrisError::Iam(e.to_string()))?,
    ));
    for (key, value) in instructions.headers() {
        signed.push((
            HeaderName::from_bytes(key.as_bytes()).map_err(|e| TigrisError::Iam(e.to_string()))?,
            HeaderValue::from_str(value).map_err(|e| TigrisError::Iam(e.to_string()))?,
        ));
    }
    Ok(signed)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex::encode(digest)
}
